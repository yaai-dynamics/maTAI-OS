'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { can, GOVERNMENT_ROLES, refusalMessage } from '@/lib/roles';
import {
  changeGovernmentRole,
  issueGovernmentAccount,
  resetAccountPassword,
  setAccountDisabled,
  unlockAccount,
  type AdminResult,
  type IssuedPassword,
} from '@/server/auth/admin';
import { changePassword } from '@/server/auth/accounts';
import { readSessionCookie } from '@/server/auth/cookies';
import { HOME } from '@/server/auth/return-path';
import { getActingAdministrator, getCurrentUser, getGovernmentRole } from '@/server/auth/session';

/**
 * Account administration actions.
 *
 * The acting administrator always comes from the session. Every action
 * re-checks the permission rather than trusting that the page hid the button,
 * because a Server Action can be called directly.
 */

async function administrator() {
  const actor = await getActingAdministrator();
  if (actor && can(actor.governmentRole, 'account:manage')) return { ok: true as const, actor };
  return { ok: false as const, error: refusalMessage(await getGovernmentRole(), 'account:manage') };
}

const refresh = () => revalidatePath('/gov/accounts');

const accountId = z.string().min(1).max(64);
const role = z.enum(GOVERNMENT_ROLES);

export async function issueAccount(input: unknown): Promise<AdminResult<IssuedPassword>> {
  const who = await administrator();
  if (!who.ok) return who;
  const parsed = z
    .object({ email: z.string().max(191), displayName: z.string().max(120), role })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Enter an email, a name and a role.' };

  const result = await issueGovernmentAccount(who.actor, parsed.data);
  if (result.ok) refresh();
  return result;
}

export async function changeRole(input: unknown): Promise<AdminResult> {
  const who = await administrator();
  if (!who.ok) return who;
  const parsed = z.object({ accountId, role }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Choose a role.' };

  const result = await changeGovernmentRole(who.actor, parsed.data.accountId, parsed.data.role);
  if (result.ok) refresh();
  return result;
}

export async function setDisabled(input: unknown): Promise<AdminResult> {
  const who = await administrator();
  if (!who.ok) return who;
  const parsed = z
    .object({ accountId, disabled: z.boolean(), reason: z.string().max(400).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That change could not be read.' };

  const result = await setAccountDisabled(who.actor, parsed.data.accountId, parsed.data.disabled, parsed.data.reason);
  if (result.ok) refresh();
  return result;
}

export async function unlock(input: unknown): Promise<AdminResult> {
  const who = await administrator();
  if (!who.ok) return who;
  const parsed = z.object({ accountId }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That account could not be found.' };

  const result = await unlockAccount(who.actor, parsed.data.accountId);
  if (result.ok) refresh();
  return result;
}

export async function resetPassword(input: unknown): Promise<AdminResult<IssuedPassword>> {
  const who = await administrator();
  if (!who.ok) return who;
  const parsed = z.object({ accountId }).safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That account could not be found.' };

  const result = await resetAccountPassword(who.actor, parsed.data.accountId);
  if (result.ok) refresh();
  return result;
}

/**
 * The holder changes their own password — including someone on a temporary
 * one, which is why this reads the raw session rather than the acting user.
 * When the change was required, the caller is sent on to their interface.
 */
export async function changeMyPassword(
  input: unknown,
): Promise<{ ok: true; home?: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Sign in again to change your password.' };

  const parsed = z
    .object({ currentPassword: z.string().max(200), newPassword: z.string().max(200), confirmPassword: z.string().max(200) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Fill in all three fields.' };
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { ok: false, error: 'The two new passwords do not match.' };
  }

  const result = await changePassword(
    user.id,
    parsed.data.currentPassword,
    parsed.data.newPassword,
    (await readSessionCookie()) ?? null,
  );
  if (!result.ok) return result;
  return user.mustChangePassword ? { ok: true, home: HOME[user.kind] } : { ok: true };
}
