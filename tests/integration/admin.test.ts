import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authenticate, changePassword, findSessionUser } from '@/server/auth/accounts';
import {
  changeGovernmentRole,
  issueGovernmentAccount,
  resetAccountPassword,
  setAccountDisabled,
  unlockAccount,
  type AdminActor,
} from '@/server/auth/admin';
import { DEMO_ACCOUNTS } from '@/server/auth/demo-accounts';
import { prisma } from '@/server/data/client';

/**
 * Account administration against MySQL.
 *
 * Accounts made here use the @admin-integration.test domain and are removed
 * afterwards. The "last administrator" rules need every other administrator
 * out of the way, so the demo administrator is disabled for this file only
 * and restored in afterAll, whatever happens.
 */

const configured = Boolean(process.env.DATABASE_URL);
const DOMAIN = '@admin-integration.test';
const demoAdminEmail = DEMO_ACCOUNTS.find((account) => account.governmentRole === 'ADMINISTRATOR')!.email;

describe.skipIf(!configured)('account administration', () => {
  let founder: AdminActor;
  let demoAdminWasDisabled = false;

  async function issue(name: string, role: 'VIEWER' | 'OFFICER' | 'ADMINISTRATOR') {
    const result = await issueGovernmentAccount(founder, { email: `${name}${DOMAIN}`, displayName: name, role });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  /** Signs in with the temporary password and replaces it, as a new starter would. */
  async function activate(email: string, temporary: string, chosen = 'a sentence I will remember') {
    const signedIn = await authenticate(email, temporary);
    if (!signedIn.ok) throw new Error(signedIn.error);
    const changed = await changePassword(signedIn.user.id, temporary, chosen, signedIn.token);
    if (!changed.ok) throw new Error(changed.error);
    return { id: signedIn.user.id, email, token: signedIn.token };
  }

  const cleanup = async () => {
    await prisma.userAccount.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    await prisma.accountAuditEvent.deleteMany({ where: { targetEmail: { endsWith: DOMAIN } } });
  };

  beforeAll(async () => {
    await cleanup();
    const demoAdmin = await prisma.userAccount.findUniqueOrThrow({ where: { email: demoAdminEmail } });
    demoAdminWasDisabled = demoAdmin.disabled;
    // The founding administrator of this test, created directly: someone had to issue the first.
    founder = { id: 'acct-admin-integration-founder', email: `founder${DOMAIN}` };
    await prisma.userAccount.create({
      data: {
        id: founder.id,
        email: founder.email,
        displayName: 'Founder',
        passwordHash: 'scrypt$not-used',
        kind: 'GOVERNMENT',
        governmentRole: 'ADMINISTRATOR',
      },
    });
    await prisma.userAccount.update({ where: { email: demoAdminEmail }, data: { disabled: true } });
  });

  afterAll(async () => {
    await prisma.userAccount.update({ where: { email: demoAdminEmail }, data: { disabled: demoAdminWasDisabled } });
    await cleanup();
    await prisma.$disconnect();
  });

  it('issues an account whose temporary password must be replaced before anything else', async () => {
    const issued = await issue('starter', 'OFFICER');
    expect(issued.temporaryPassword).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/);

    const signedIn = await authenticate(issued.email, issued.temporaryPassword);
    expect(signedIn.ok && signedIn.user.mustChangePassword).toBe(true);
    if (!signedIn.ok) return;

    expect((await changePassword(signedIn.user.id, 'wrong', 'a sentence I will remember', signedIn.token)).ok).toBe(false);
    expect((await changePassword(signedIn.user.id, issued.temporaryPassword, 'short', signedIn.token)).ok).toBe(false);
    expect(
      (await changePassword(signedIn.user.id, issued.temporaryPassword, 'starter-is-my-password', signedIn.token)).ok,
    ).toBe(false);

    const changed = await changePassword(signedIn.user.id, issued.temporaryPassword, 'a sentence I will remember', signedIn.token);
    expect(changed.ok).toBe(true);
    expect((await findSessionUser(signedIn.token))?.mustChangePassword).toBe(false);
    expect((await authenticate(issued.email, issued.temporaryPassword)).ok).toBe(false);
  });

  it('keeps the session that changed the password and ends the others', async () => {
    const issued = await issue('two-devices', 'VIEWER');
    const laptop = await authenticate(issued.email, issued.temporaryPassword);
    const phone = await authenticate(issued.email, issued.temporaryPassword);
    if (!laptop.ok || !phone.ok) throw new Error('sign in failed');

    await changePassword(laptop.user.id, issued.temporaryPassword, 'a sentence I will remember', laptop.token);
    expect(await findSessionUser(laptop.token)).not.toBeNull();
    expect(await findSessionUser(phone.token)).toBeNull();
  });

  it('stops a temporary password working once it expires', async () => {
    const result = await issueGovernmentAccount(
      founder,
      { email: `late${DOMAIN}`, displayName: 'Late', role: 'VIEWER' },
      new Date(Date.now() - 73 * 60 * 60 * 1000),
    );
    if (!result.ok) throw new Error(result.error);
    const late = await authenticate(result.value.email, result.value.temporaryPassword);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toMatch(/expired/);
  });

  it('refuses a duplicate email and a malformed one', async () => {
    await issue('dupe', 'VIEWER');
    expect((await issueGovernmentAccount(founder, { email: `DUPE${DOMAIN}`, displayName: 'Dupe', role: 'VIEWER' })).ok).toBe(false);
    expect((await issueGovernmentAccount(founder, { email: 'not-an-email', displayName: 'X', role: 'VIEWER' })).ok).toBe(false);
  });

  it('never lets an administrator disable, demote or reset themselves', async () => {
    expect((await setAccountDisabled(founder, founder.id, true, undefined)).ok).toBe(false);
    expect((await changeGovernmentRole(founder, founder.id, 'VIEWER')).ok).toBe(false);
    expect((await resetAccountPassword(founder, founder.id)).ok).toBe(false);
  });

  it('protects the last active administrator', async () => {
    // The rule lives in the ledger of accounts, not in who is asking: even a
    // caller the action layer let through cannot remove the last one.
    const other: AdminActor = { id: 'acct-some-other-admin', email: `other${DOMAIN}` };

    const demoted = await changeGovernmentRole(other, founder.id, 'OFFICER');
    expect(demoted).toEqual({ ok: false, error: expect.stringMatching(/last active administrator/) });
    const disabled = await setAccountDisabled(other, founder.id, true, 'test');
    expect(disabled).toEqual({ ok: false, error: expect.stringMatching(/last active administrator/) });
  });

  it('lets exactly one of two administrators demoting each other at once succeed', async () => {
    const second = await issue('second-admin', 'ADMINISTRATOR');
    const secondActor: AdminActor = { id: second.accountId, email: second.email };

    const [a, b] = await Promise.all([
      changeGovernmentRole(founder, second.accountId, 'OFFICER'),
      changeGovernmentRole(secondActor, founder.id, 'OFFICER'),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);

    const remaining = await prisma.userAccount.count({
      where: { email: { endsWith: DOMAIN }, governmentRole: 'ADMINISTRATOR', disabled: false },
    });
    expect(remaining).toBe(1);

    // Put the founder back in charge for the tests that follow.
    const founderRow = await prisma.userAccount.findUniqueOrThrow({ where: { id: founder.id } });
    if (founderRow.governmentRole !== 'ADMINISTRATOR') {
      await prisma.userAccount.update({ where: { id: founder.id }, data: { governmentRole: 'ADMINISTRATOR' } });
    }
    await prisma.userAccount.update({ where: { id: second.accountId }, data: { governmentRole: 'OFFICER' } });
  });

  it('ends every session of a disabled account, and enabling does not revive them', async () => {
    const issued = await issue('leaver', 'OFFICER');
    const person = await activate(issued.email, issued.temporaryPassword);

    expect((await setAccountDisabled(founder, person.id, true, 'Left the department')).ok).toBe(true);
    expect(await findSessionUser(person.token)).toBeNull();
    expect(await prisma.authSession.count({ where: { userId: person.id } })).toBe(0);

    expect((await setAccountDisabled(founder, person.id, false, undefined)).ok).toBe(true);
    expect(await findSessionUser(person.token)).toBeNull();
    expect((await authenticate(issued.email, 'a sentence I will remember')).ok).toBe(true);
  });

  it('resets a password: the old one stops working and every session ends', async () => {
    const issued = await issue('forgetful', 'VIEWER');
    const person = await activate(issued.email, issued.temporaryPassword);

    const reset = await resetAccountPassword(founder, person.id);
    if (!reset.ok) throw new Error(reset.error);
    expect(await findSessionUser(person.token)).toBeNull();
    expect((await authenticate(issued.email, 'a sentence I will remember')).ok).toBe(false);

    const again = await authenticate(issued.email, reset.value.temporaryPassword);
    expect(again.ok && again.user.mustChangePassword).toBe(true);
  });

  it('unlocks a locked account', async () => {
    const issued = await issue('locked-out', 'VIEWER');
    await prisma.userAccount.update({
      where: { id: issued.accountId },
      data: { lockedUntil: new Date(Date.now() + 10 * 60 * 1000), failedLoginCount: 0 },
    });
    expect((await authenticate(issued.email, issued.temporaryPassword)).ok).toBe(false);
    expect((await unlockAccount(founder, issued.accountId)).ok).toBe(true);
    expect((await authenticate(issued.email, issued.temporaryPassword)).ok).toBe(true);
    expect((await unlockAccount(founder, issued.accountId)).ok).toBe(false);
  });

  it('records every change in the audit trail, and never a password', async () => {
    const t0 = Date.now();
    const made = await issueGovernmentAccount(
      founder,
      { email: `audited${DOMAIN}`, displayName: 'Audited', role: 'VIEWER' },
      new Date(t0),
    );
    if (!made.ok) throw new Error(made.error);
    const issued = made.value;
    await changeGovernmentRole(founder, issued.accountId, 'OFFICER', new Date(t0 + 1000));
    const reset = await resetAccountPassword(founder, issued.accountId, new Date(t0 + 2000));
    if (!reset.ok) throw new Error(reset.error);

    const trail = await prisma.accountAuditEvent.findMany({ where: { targetId: issued.accountId }, orderBy: { at: 'asc' } });
    expect(trail.map((row) => row.action)).toEqual(['ISSUED', 'ROLE_CHANGED', 'PASSWORD_RESET']);
    expect(trail.every((row) => row.actorEmail === founder.email)).toBe(true);
    expect(trail[1]!.detail).toBe('VIEWER → OFFICER.');

    const everything = JSON.stringify(await prisma.accountAuditEvent.findMany({ where: { targetEmail: { endsWith: DOMAIN } } }));
    expect(everything).not.toContain(issued.temporaryPassword);
    expect(everything).not.toContain(reset.value.temporaryPassword);
  });
});
