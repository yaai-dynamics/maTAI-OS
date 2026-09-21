import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can } from '@/lib/roles';
import {
  computeCreatorReputation,
  computeIntegrityFlags,
  INTEGRITY_RULES,
  proposePayouts,
} from '@/server/analytics/integrity';
import { matchCreators } from '@/server/analytics/matching';
import { getCampaign, getCreator, getPayouts } from '@/server/data/repository';
import { resetState, submitContent } from '@/server/data/store';

/**
 * Roadmap Phase 3 — creator economy.
 *
 * Integrity checks, reputation earned rather than declared, and a payout
 * workflow that records what is owed without moving money.
 */

vi.mock('next/cache', () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock('@/server/auth/session', async () => (await import('./support/identity')).sessionModule);
vi.mock('@/server/auth/accounts', async () => (await import('./support/identity')).accountsModule);
vi.mock('@/server/auth/registration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/registration')>()),
  openAccountAndSignIn: (await import('./support/identity')).openAccountAndSignIn,
}));

import { acting, registeredEmails } from './support/identity';

acting.role = 'ADMINISTRATOR';

// Several tests register the same fixture, so every test starts with no emails taken.
beforeEach(() => {
  registeredEmails.clear();
});

const { onboardCreator, verifyCreator } = await import('@/server/actions/creator-onboarding');
const { approvePayout } = await import('@/server/actions/payouts');

const newCreator = {
  displayName: 'Eastern Hills Film',
  homeDistrict: 'Ukhrul',
  categories: ['nature', 'culture'],
  languages: ['English'],
  platforms: ['Instagram'],
  audienceSummary: 'Outdoor and hill travel audience',
  audienceAgeBand: '18-35',
  email: 'eastern-hills@creator.test',
  password: 'a long enough passphrase',
};

describe('creator onboarding', () => {
  beforeEach(() => {
    resetState();
    acting.role = 'ADMINISTRATOR';
  });

  it('starts a new creator unverified, with no reputation', async () => {
    const result = await onboardCreator(newCreator);

    expect(result.ok).toBe(true);
    expect(result.creator?.status).toBe('PENDING_VERIFICATION');
    expect(result.creator?.verified).toBe(false);
    // Reputation is earned from delivery, so it cannot arrive with the profile.
    expect(result.creator?.creatorScore).toBe(0);
    expect(result.creator?.campaignsCompleted).toBe(0);
  });

  it('refuses a district that is not in Manipur', async () => {
    const result = await onboardCreator({ ...newCreator, homeDistrict: 'Somewhere Else' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/district of Manipur/i);
  });

  it('keeps an unverified creator out of every shortlist', async () => {
    const registered = await onboardCreator(newCreator);
    const campaign = getCampaign('camp-001')!;

    const before = matchCreators(campaign, 50);
    expect(before.some((match) => match.creator.id === registered.creator!.id)).toBe(false);

    await verifyCreator(registered.creator!.id, 'VERIFY');

    const after = matchCreators(campaign, 50);
    expect(after.some((match) => match.creator.id === registered.creator!.id)).toBe(true);
  });

  it('refuses verification from a viewer', async () => {
    const registered = await onboardCreator(newCreator);
    acting.role = 'VIEWER';

    const result = await verifyCreator(registered.creator!.id, 'VERIFY');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/viewer cannot/i);
    expect(getCreator(registered.creator!.id)?.verified).toBe(false);
  });
});

describe('integrity checks', () => {
  beforeEach(() => {
    resetState();
  });

  it('flags a duplicate content link at hold severity', async () => {
    const base = {
      campaignId: 'camp-002',
      creatorId: 'creator-002',
      platform: 'Instagram' as const,
      contentUrl: 'demo://content/duplicated',
      caption: 'A caption that is definitely long enough to pass the thin caption rule.',
      disclosure: 'Paid partnership with Manipur Tourism',
      status: 'SUBMITTED' as const,
      submittedAt: '2026-09-15T10:00:00Z',
      provenance: 'DEMO_SYNTHETIC' as const,
    };
    await submitContent({ ...base, id: 'content-dup-1', title: 'First' });
    await submitContent({ ...base, id: 'content-dup-2', title: 'Second' });

    const flags = computeIntegrityFlags().filter((flag) => flag.rule === 'DUPLICATE_URL');
    expect(flags.length).toBeGreaterThanOrEqual(2);
    expect(flags[0]?.severity).toBe('HOLD');
  });

  it('flags a missing paid partnership disclosure at hold severity', async () => {
    await submitContent({
      id: 'content-nodisc',
      campaignId: 'camp-002',
      creatorId: 'creator-002',
      title: 'No disclosure',
      platform: 'Instagram',
      contentUrl: 'demo://content/nodisc',
      caption: 'A caption that is definitely long enough to pass the thin caption rule.',
      disclosure: 'just a post',
      status: 'SUBMITTED',
      submittedAt: '2026-09-15T10:00:00Z',
      provenance: 'DEMO_SYNTHETIC',
    });

    const flag = computeIntegrityFlags().find(
      (entry) => entry.contentId === 'content-nodisc' && entry.rule === 'MISSING_DISCLOSURE',
    );
    expect(flag).toBeDefined();
    expect(flag?.severity).toBe('HOLD');
  });

  it('flags a submission made outside the campaign window', async () => {
    await submitContent({
      id: 'content-late',
      campaignId: 'camp-000',
      creatorId: 'creator-003',
      title: 'Late submission',
      platform: 'Instagram',
      contentUrl: 'demo://content/late',
      caption: 'A caption that is definitely long enough to pass the thin caption rule.',
      disclosure: 'Paid partnership with Manipur Tourism',
      status: 'SUBMITTED',
      submittedAt: '2026-09-15T10:00:00Z',
      provenance: 'DEMO_SYNTHETIC',
    });

    const flag = computeIntegrityFlags().find(
      (entry) => entry.contentId === 'content-late' && entry.rule === 'OUTSIDE_WINDOW',
    );
    expect(flag).toBeDefined();
  });

  it('names the rule behind every flag', () => {
    for (const flag of computeIntegrityFlags()) {
      expect(Object.keys(INTEGRITY_RULES)).toContain(flag.rule);
      expect(flag.description.length).toBeGreaterThan(10);
      expect(flag.detail.length).toBeGreaterThan(0);
    }
  });

  it('flags nothing on the clean seeded content', () => {
    const holds = computeIntegrityFlags().filter((flag) => flag.severity === 'HOLD');
    expect(holds).toHaveLength(0);
  });
});

describe('creator reputation', () => {
  beforeEach(() => {
    resetState();
  });

  it('is computed from delivery, and stays within 0 to 100', () => {
    const reputation = computeCreatorReputation('creator-002');
    expect(reputation).toBeDefined();
    expect(reputation!.score).toBeGreaterThanOrEqual(0);
    expect(reputation!.score).toBeLessThanOrEqual(100);

    const summed = reputation!.components.reduce((sum, part) => sum + part.score, 0);
    expect(Math.abs(summed - reputation!.score)).toBeLessThan(0.5);
  });

  it('keeps the declared score visible alongside the computed one', () => {
    const reputation = computeCreatorReputation('creator-002')!;
    expect(reputation.declaredScore).toBe(getCreator('creator-002')!.creatorScore);
  });

  it('gives a brand new creator no score, and says it is absence of evidence', async () => {
    const registered = await onboardCreator(newCreator);
    const reputation = computeCreatorReputation(registered.creator!.id)!;

    // Absence of evidence is not evidence of quality: no component may award
    // credit for a clean record the creator has not had the chance to earn.
    expect(reputation.score).toBe(0);
    expect(reputation.hasTrackRecord).toBe(false);
    expect(reputation.published).toBe(0);
    for (const component of reputation.components) {
      expect(component.score).toBe(0);
    }
  });

  it('penalises an open integrity flag', async () => {
    const before = computeCreatorReputation('creator-002')!;

    await submitContent({
      id: 'content-flagged',
      campaignId: 'camp-002',
      creatorId: 'creator-002',
      title: 'Flagged',
      platform: 'Instagram',
      contentUrl: 'demo://content/flagged',
      caption: 'Too short',
      disclosure: 'nothing',
      status: 'SUBMITTED',
      submittedAt: '2026-09-15T10:00:00Z',
      provenance: 'DEMO_SYNTHETIC',
    });

    const after = computeCreatorReputation('creator-002')!;
    expect(after.openFlags).toBeGreaterThan(before.openFlags);
    expect(after.score).toBeLessThan(before.score);
  });
});

describe('payout workflow', () => {
  beforeEach(() => {
    resetState();
    acting.role = 'ADMINISTRATOR';
  });

  it('splits the reward pool by published volume and states the basis', () => {
    const proposals = proposePayouts('camp-000');
    expect(proposals.length).toBeGreaterThan(0);

    const total = proposals.reduce((sum, row) => sum + row.sharePercent, 0);
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);

    for (const proposal of proposals) {
      expect(proposal.basis).toMatch(/share of the/i);
      expect(proposal.amount).toBeGreaterThanOrEqual(0);
    }
  });

  it('refuses to re-approve a payout that has already been paid', async () => {
    // The seeded completed campaign already has paid payouts recorded.
    const proposal = proposePayouts('camp-000').find((row) => !row.blocked)!;
    const result = await approvePayout(proposal.campaignId, proposal.creatorId);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already paid/i);
  });

  it('records an approval without moving money', async () => {
    const proposal = proposePayouts('camp-002').find((row) => !row.blocked)!;
    const result = await approvePayout(proposal.campaignId, proposal.creatorId);

    expect(result.ok).toBe(true);
    expect(result.payout?.status).toBe('APPROVED');
    expect(getPayouts(proposal.creatorId).some((row) => row.status === 'APPROVED')).toBe(true);
  });

  it('refuses approval from an officer, because it is an administrator action', async () => {
    acting.role = 'OFFICER';
    expect(can('OFFICER', 'payout:approve')).toBe(false);

    const proposal = proposePayouts('camp-000')[0]!;
    const result = await approvePayout(proposal.campaignId, proposal.creatorId);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot approve creator payouts/i);
  });

  it('blocks approval while a hold-level integrity check is open', async () => {
    await submitContent({
      id: 'content-hold',
      campaignId: 'camp-000',
      creatorId: 'creator-003',
      title: 'No disclosure',
      platform: 'Instagram',
      contentUrl: 'demo://content/hold',
      caption: 'A caption that is definitely long enough to pass the thin caption rule.',
      disclosure: 'no disclosure here',
      status: 'PUBLISHED',
      submittedAt: '2026-08-12T10:00:00Z',
      provenance: 'DEMO_SYNTHETIC',
    });

    const proposal = proposePayouts('camp-000').find((row) => row.creatorId === 'creator-003')!;
    expect(proposal.blocked).toBe(true);
    expect(proposal.blockedReason).toBeTruthy();

    const result = await approvePayout('camp-000', 'creator-003');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/blocked/i);
  });

  it('proposes nothing for a campaign with no published content', () => {
    expect(proposePayouts('camp-001')).toHaveLength(0);
  });
});
