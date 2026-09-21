import { headers } from 'next/headers';
import { z } from 'zod';

import { createAccount, createSession, type NewAccount } from '@/server/auth/accounts';
import { setSessionCookie } from '@/server/auth/cookies';
import { PASSWORD_MIN_LENGTH } from '@/server/auth/password';

/**
 * Self-registration, shared by partner and creator onboarding.
 *
 * Only partner and creator accounts can be self-registered, and each is bound
 * to the one business or creator profile created in the same step. Government
 * accounts are never self-registered: a role that grants campaign launch or
 * payout approval has to be issued by the department.
 */

export const credentialsSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(191),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters for the password.`)
    .max(200),
  contactName: z.string().trim().min(2, 'Enter the name of the person responsible.').max(120),
});

export type Credentials = z.infer<typeof credentialsSchema>;

export async function openAccountAndSignIn(
  account: Omit<NewAccount, 'governmentRole'> & { kind: 'PARTNER' | 'CREATOR' },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const created = await createAccount(account);
  if (!created.ok) return created;

  const userAgent = (await headers()).get('user-agent') ?? undefined;
  const { token, expiresAt } = await createSession(created.id, userAgent);
  await setSessionCookie(token, expiresAt);
  return { ok: true };
}
