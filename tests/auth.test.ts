import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can, PERMISSIONS, refusalMessage } from '@/lib/roles';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { safeReturnPath } from '@/server/auth/return-path';
import { hashToken, looksLikeToken, newSessionToken } from '@/server/auth/tokens';
import { getEnquiries } from '@/server/data/repository';
import { resetState } from '@/server/data/store';

/**
 * Authentication and identity.
 *
 * The first half tests the primitives directly. The second half tests the
 * reason this system exists: that the acting identity comes from the session
 * and never from the request, so a caller cannot act for someone else by
 * naming them.
 */

vi.mock('next/cache', () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock('@/server/auth/session', async () => (await import('./support/identity')).sessionModule);
vi.mock('@/server/auth/accounts', async () => (await import('./support/identity')).accountsModule);
vi.mock('@/server/auth/registration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/registration')>()),
  openAccountAndSignIn: (await import('./support/identity')).openAccountAndSignIn,
}));

import { actAs, registeredEmails } from './support/identity';

const { reportAvailability, respondToEnquiry, onboardBusiness } = await import('@/server/actions/partner');
const { applyToCampaign, buildBrief, submitCampaignContent } = await import('@/server/actions/creator');
const { createNewCampaign } = await import('@/server/actions/government');

describe('password hashing', () => {
  it('verifies the password it hashed and nothing else', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(await verifyPassword('correct horse battery stapl', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('salts every hash, so equal passwords do not produce equal rows', async () => {
    const a = await hashPassword('same password twice');
    const b = await hashPassword('same password twice');
    expect(a).not.toBe(b);
  });

  it('records its parameters, so the cost can be raised without breaking old hashes', async () => {
    const stored = await hashPassword('parameters travel with the hash');
    expect(stored).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('treats a malformed stored hash as a failed login, not a crash', async () => {
    for (const junk of ['', 'plaintext', 'scrypt$1$2', 'bcrypt$10$abc$def$ghi$jkl', 'scrypt$x$8$3$aa$bb']) {
      await expect(verifyPassword('anything', junk)).resolves.toBe(false);
    }
  });

  it('never stores the password itself', async () => {
    const stored = await hashPassword('do-not-store-me-123');
    expect(stored).not.toContain('do-not-store-me-123');
  });
});

describe('session tokens', () => {
  it('issues 256 random bits in a cookie-safe encoding', () => {
    const token = newSessionToken();
    expect(looksLikeToken(token)).toBe(true);
    expect(newSessionToken()).not.toBe(token);
  });

  it('stores a hash, so a copied session table cannot be replayed as a cookie', () => {
    const token = newSessionToken();
    const stored = hashToken(token);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain(token);
    expect(hashToken(token)).toBe(stored);
  });

  it('rejects junk cookies before they reach the database', () => {
    for (const junk of [undefined, '', 'short', 'a'.repeat(44), 'has spaces in it and is long enough to pass......']) {
      expect(looksLikeToken(junk)).toBe(false);
    }
  });
});

describe('the return address after sign-in', () => {
  it('keeps a path inside the account\'s own interface', () => {
    expect(safeReturnPath('/gov/campaigns?id=camp-001', 'GOVERNMENT')).toBe('/gov/campaigns?id=camp-001');
    expect(safeReturnPath('/partner/enquiries', 'PARTNER')).toBe('/partner/enquiries');
  });

  it('refuses anything that could leave the site', () => {
    for (const hostile of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(safeReturnPath(hostile, 'GOVERNMENT')).toBe('/gov');
    }
  });

  it('refuses a path into another interface', () => {
    expect(safeReturnPath('/gov', 'PARTNER')).toBe('/partner');
    // A prefix is not a match: /government is not inside /gov.
    expect(safeReturnPath('/government', 'GOVERNMENT')).toBe('/gov');
  });
});

describe('permissions for a caller who is not signed in', () => {
  it('grants an anonymous caller nothing', () => {
    for (const permission of PERMISSIONS) expect(can(null, permission)).toBe(false);
  });

  it('tells them to sign in rather than naming a role they do not have', () => {
    expect(refusalMessage(null, 'campaign:create')).toMatch(/sign in with a government account/i);
  });
});

describe('identity comes from the session, never from the request', () => {
  beforeEach(() => {
    resetState();
    registeredEmails.clear();
  });

  it('refuses every write from a caller who is not signed in', async () => {
    actAs({});

    expect((await reportAvailability({ date: '2026-09-16', totalCapacity: 4, availableCapacity: 2 })).error).toMatch(
      /sign in/i,
    );
    expect((await respondToEnquiry({ enquiryId: getEnquiries()[0]!.id, status: 'CONFIRMED' })).error).toMatch(
      /sign in/i,
    );
    expect((await applyToCampaign('camp-001')).error).toMatch(/sign in/i);
    expect((await buildBrief('camp-001')).error).toMatch(/sign in/i);
    expect((await createNewCampaign({})).ok).toBe(false);
  });

  it('reports availability for the signed-in business even if the request names another', async () => {
    actAs({ businessId: 'biz-013' });
    const result = await reportAvailability({
      // A hostile caller naming someone else's homestay. It must be ignored.
      businessId: 'biz-001',
      date: '2026-09-16',
      totalCapacity: 9,
      availableCapacity: 3,
    });

    expect(result.ok).toBe(true);
    expect(result.snapshot?.businessId).toBe('biz-013');
  });

  it('will not let a partner answer another business\'s enquiry', async () => {
    const theirs = getEnquiries().find((enquiry) => enquiry.businessId !== 'biz-013')!;
    actAs({ businessId: 'biz-013' });

    const result = await respondToEnquiry({ enquiryId: theirs.id, status: 'DECLINED' });

    expect(result.ok).toBe(false);
    // Same wording as a missing enquiry, so it does not confirm the id exists.
    expect(result.error).toBe('That enquiry no longer exists.');
    expect(getEnquiries().find((enquiry) => enquiry.id === theirs.id)?.status).not.toBe('DECLINED');
  });

  it('submits content as the signed-in creator even if the request names another', async () => {
    actAs({ creatorId: 'creator-002' });
    const result = await submitCampaignContent({
      campaignId: 'camp-002',
      creatorId: 'creator-005',
      title: 'Whose content is this',
      platform: 'Instagram',
      contentUrl: 'demo://content/identity-test',
      caption: 'A caption long enough to pass the length check for content.',
      disclosure: 'Paid partnership with Manipur Tourism',
    });

    expect(result.ok).toBe(true);
    expect(result.content?.creatorId).toBe('creator-002');
  });

  it('refuses content for a campaign the creator is not on', async () => {
    actAs({ creatorId: 'creator-001' });
    const result = await submitCampaignContent({
      campaignId: 'camp-002',
      title: 'Not my campaign',
      platform: 'Instagram',
      contentUrl: 'demo://content/not-mine',
      caption: 'A caption long enough to pass the length check for content.',
      disclosure: 'Paid partnership with Manipur Tourism',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/apply to this campaign/i);
  });

  it('refuses a second registration with the same email', async () => {
    const registration = {
      name: 'Twice Registered Homestay',
      businessType: 'HOMESTAY',
      destinationId: 'dest-ukhrul',
      contactVisibility: 'ON_ENQUIRY',
      contactName: 'Owner',
      email: 'Owner@Example.test',
      password: 'a long enough passphrase',
    };

    expect((await onboardBusiness(registration)).ok).toBe(true);
    const second = await onboardBusiness({ ...registration, email: ' owner@example.test ' });

    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already exists/i);
  });

  it('refuses a registration with a password too short to be worth having', async () => {
    const result = await onboardBusiness({
      name: 'Short Password Homestay',
      businessType: 'HOMESTAY',
      destinationId: 'dest-ukhrul',
      contactVisibility: 'ON_ENQUIRY',
      contactName: 'Owner',
      email: 'short@example.test',
      password: 'abc123',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least 10 characters/i);
  });
});
