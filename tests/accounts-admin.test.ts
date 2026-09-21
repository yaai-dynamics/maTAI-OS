import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can, permissionsFor } from '@/lib/roles';

/**
 * The account administration actions refuse anyone but an administrator,
 * before any account is touched. The rules inside (last administrator,
 * self-protection, temporary passwords) run against MySQL in
 * tests/integration/admin.test.ts.
 */

const who = vi.hoisted(() => ({
  role: null as null | 'VIEWER' | 'OFFICER' | 'ADMINISTRATOR',
  mustChangePassword: false,
}));

vi.mock('@/server/auth/session', () => ({
  NOT_SIGNED_IN: 'Sign in to do that.',
  getGovernmentRole: async () => (who.mustChangePassword ? null : who.role),
  getActingAdministrator: async () =>
    who.role === 'ADMINISTRATOR' && !who.mustChangePassword
      ? { id: 'acct-admin', email: 'admin@example.test', kind: 'GOVERNMENT', governmentRole: 'ADMINISTRATOR' }
      : null,
  getCurrentUser: async () => null,
}));

const admin = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('@/server/auth/admin', () => {
  const record =
    (name: string) =>
    async (..._args: unknown[]) => {
      admin.calls.push(name);
      return { ok: true, value: { accountId: 'acct-x', email: 'x@example.test', temporaryPassword: 'Ab12-Cd34-Ef56-Gh78', expiresAt: '' } };
    };
  return {
    issueGovernmentAccount: record('issue'),
    changeGovernmentRole: record('role'),
    setAccountDisabled: record('disable'),
    unlockAccount: record('unlock'),
    resetAccountPassword: record('reset'),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

import { changeRole, issueAccount, resetPassword, setDisabled, unlock } from '@/server/actions/accounts';

const attempts = () => [
  issueAccount({ email: 'new@example.test', displayName: 'New Person', role: 'OFFICER' }),
  changeRole({ accountId: 'acct-y', role: 'ADMINISTRATOR' }),
  setDisabled({ accountId: 'acct-y', disabled: true }),
  unlock({ accountId: 'acct-y' }),
  resetPassword({ accountId: 'acct-y' }),
];

beforeEach(() => {
  admin.calls = [];
  who.role = null;
  who.mustChangePassword = false;
});

describe('account administration actions', () => {
  it('is an administrator-only permission', () => {
    expect(can('ADMINISTRATOR', 'account:manage')).toBe(true);
    expect(can('OFFICER', 'account:manage')).toBe(false);
    expect(can('VIEWER', 'account:manage')).toBe(false);
    expect(permissionsFor('OFFICER')).not.toContain('account:manage');
  });

  for (const role of [null, 'VIEWER', 'OFFICER'] as const) {
    it(`refuses ${role ?? 'an anonymous caller'} and touches nothing`, async () => {
      who.role = role;
      const results = await Promise.all(attempts());
      expect(results.every((result) => !result.ok)).toBe(true);
      expect(admin.calls).toEqual([]);
      const first = results[0]!;
      if (!first.ok) expect(first.error).toMatch(role === null ? /sign in with a government account/i : /needs administrator/i);
    });
  }

  it('refuses an administrator still on a temporary password', async () => {
    who.role = 'ADMINISTRATOR';
    who.mustChangePassword = true;
    const results = await Promise.all(attempts());
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(admin.calls).toEqual([]);
  });

  it('lets an administrator through, with the input checked first', async () => {
    who.role = 'ADMINISTRATOR';
    const results = await Promise.all(attempts());
    expect(results.every((result) => result.ok)).toBe(true);
    expect(admin.calls.sort()).toEqual(['disable', 'issue', 'reset', 'role', 'unlock']);

    admin.calls = [];
    expect((await changeRole({ accountId: 'acct-y', role: 'SUPERUSER' })).ok).toBe(false);
    expect((await setDisabled({ accountId: 'acct-y', disabled: 'yes' })).ok).toBe(false);
    expect(admin.calls).toEqual([]);
  });
});
