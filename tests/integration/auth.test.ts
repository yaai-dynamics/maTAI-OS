import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  authenticate,
  createAccount,
  findSessionUser,
  INVALID_CREDENTIALS,
  LOCKOUT_THRESHOLD,
  revokeSession,
} from '@/server/auth/accounts';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/server/auth/demo-accounts';
import { hashToken } from '@/server/auth/tokens';
import { prisma } from '@/server/data/client';

/**
 * Accounts and sessions against MySQL.
 *
 * Skips itself without DATABASE_URL. Accounts it creates use the
 * @integration.test domain and are removed afterwards, so the seeded demo
 * accounts are left exactly as they were.
 */

const configured = Boolean(process.env.DATABASE_URL);
const officer = DEMO_ACCOUNTS.find((account) => account.governmentRole === 'OFFICER')!;

describe.skipIf(!configured)('accounts and sessions', () => {
  const tokens: string[] = [];

  beforeAll(async () => {
    await prisma.userAccount.deleteMany({ where: { email: { endsWith: '@integration.test' } } });
  });

  afterAll(async () => {
    for (const token of tokens) await revokeSession(token);
    await prisma.userAccount.deleteMany({ where: { email: { endsWith: '@integration.test' } } });
    await prisma.$disconnect();
  });

  it('signs a seeded account in and resolves the session to the same person', async () => {
    const result = await authenticate(officer.email, DEMO_PASSWORD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    tokens.push(result.token);

    const user = await findSessionUser(result.token);
    expect(user?.email).toBe(officer.email);
    expect(user?.kind).toBe('GOVERNMENT');
    expect(user?.governmentRole).toBe('OFFICER');
  });

  it('matches email case-insensitively, as people type it', async () => {
    const result = await authenticate(`  ${officer.email.toUpperCase()} `, DEMO_PASSWORD);
    expect(result.ok).toBe(true);
    if (result.ok) tokens.push(result.token);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await authenticate(officer.email, 'not the password');
    const unknownEmail = await authenticate('nobody@integration.test', 'not the password');

    expect(wrongPassword).toEqual({ ok: false, error: INVALID_CREDENTIALS });
    expect(unknownEmail).toEqual({ ok: false, error: INVALID_CREDENTIALS });

    // Reset the failure count that attempt added to the shared demo account.
    await prisma.userAccount.update({ where: { email: officer.email }, data: { failedLoginCount: 0 } });
  });

  it('stores only a hash of the session token', async () => {
    const result = await authenticate(officer.email, DEMO_PASSWORD);
    if (!result.ok) throw new Error('sign in failed');
    tokens.push(result.token);

    expect(await prisma.authSession.findUnique({ where: { id: result.token } })).toBeNull();
    expect(await prisma.authSession.findUnique({ where: { id: hashToken(result.token) } })).not.toBeNull();
  });

  it('ends a session everywhere once it is revoked', async () => {
    const result = await authenticate(officer.email, DEMO_PASSWORD);
    if (!result.ok) throw new Error('sign in failed');

    await revokeSession(result.token);
    expect(await findSessionUser(result.token)).toBeNull();
  });

  it('refuses an expired session and removes it', async () => {
    const result = await authenticate(officer.email, DEMO_PASSWORD);
    if (!result.ok) throw new Error('sign in failed');

    await prisma.authSession.update({
      where: { id: hashToken(result.token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await findSessionUser(result.token)).toBeNull();
    expect(await prisma.authSession.findUnique({ where: { id: hashToken(result.token) } })).toBeNull();
  });

  it('locks an account after repeated failures, even against the right password', async () => {
    const created = await createAccount({
      email: 'lockout@integration.test',
      password: 'the right passphrase',
      displayName: 'Lockout Test',
      kind: 'CREATOR',
      creatorId: 'creator-016',
    });
    expect(created.ok).toBe(true);

    for (let attempt = 0; attempt < LOCKOUT_THRESHOLD; attempt += 1) {
      await authenticate('lockout@integration.test', 'wrong passphrase');
    }

    const locked = await authenticate('lockout@integration.test', 'the right passphrase');
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error).toMatch(/too many failed attempts/i);
  });

  it('stops a disabled account from signing in, and ends its open sessions', async () => {
    const created = await createAccount({
      email: 'disabled@integration.test',
      password: 'the right passphrase',
      displayName: 'Disabled Test',
      kind: 'CREATOR',
      creatorId: 'creator-015',
    });
    if (!created.ok) throw new Error(created.error);

    const open = await authenticate('disabled@integration.test', 'the right passphrase');
    if (!open.ok) throw new Error('sign in failed');

    await prisma.userAccount.update({ where: { id: created.id }, data: { disabled: true } });

    expect(await findSessionUser(open.token)).toBeNull();
    expect((await authenticate('disabled@integration.test', 'the right passphrase')).ok).toBe(false);
  });

  it('treats an account whose profile was removed as signed out', async () => {
    const created = await createAccount({
      email: 'unbound@integration.test',
      password: 'the right passphrase',
      displayName: 'Unbound Test',
      kind: 'CREATOR',
      creatorId: 'creator-014',
    });
    if (!created.ok) throw new Error(created.error);

    const open = await authenticate('unbound@integration.test', 'the right passphrase');
    if (!open.ok) throw new Error('sign in failed');

    // What the foreign key does when the creator profile is deleted.
    await prisma.userAccount.update({ where: { id: created.id }, data: { creatorId: null } });

    expect(await findSessionUser(open.token)).toBeNull();
    expect((await authenticate('unbound@integration.test', 'the right passphrase')).ok).toBe(false);
  });

  it('refuses account shapes that would grant the wrong thing', async () => {
    const base = { password: 'the right passphrase', displayName: 'Shape Test' };

    expect(
      (await createAccount({ ...base, email: 'a@integration.test', kind: 'GOVERNMENT' })).ok,
    ).toBe(false);
    expect(
      (await createAccount({ ...base, email: 'b@integration.test', kind: 'PARTNER', governmentRole: 'ADMINISTRATOR', businessId: 'biz-001' })).ok,
    ).toBe(false);
    expect(
      (await createAccount({ ...base, email: 'c@integration.test', kind: 'PARTNER', businessId: 'biz-001', creatorId: 'creator-001' })).ok,
    ).toBe(false);
  });
});
