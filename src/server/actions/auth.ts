'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { FormState } from '@/lib/form-state';
import { authenticate, revokeSession } from '@/server/auth/accounts';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from '@/server/auth/cookies';
import { safeReturnPath } from '@/server/auth/return-path';
import { CHANGE_PASSWORD_PATH } from '@/server/auth/session';
import { looksLikeToken } from '@/server/auth/tokens';

export async function signInForm(_prev: FormState, data: FormData): Promise<FormState> {
  const email = typeof data.get('email') === 'string' ? String(data.get('email')) : '';
  const password = typeof data.get('password') === 'string' ? String(data.get('password')) : '';
  const next = typeof data.get('next') === 'string' ? String(data.get('next')) : '';

  if (!email || !password) {
    return { status: 'error', message: 'Enter your email and password.' };
  }

  const userAgent = (await headers()).get('user-agent') ?? undefined;
  const result = await authenticate(email, password, userAgent);
  if (!result.ok) return { status: 'error', message: result.error };

  // Signing in over an existing session (switching account) ends the old one
  // rather than leaving it valid in the database until it expires.
  const previous = await readSessionCookie();
  if (looksLikeToken(previous)) await revokeSession(previous);

  await setSessionCookie(result.token, result.expiresAt);
  // redirect() throws to unwind, so it sits outside any try block.
  if (result.user.mustChangePassword) redirect(`${CHANGE_PASSWORD_PATH}?required=1`);
  redirect(safeReturnPath(next, result.user.kind));
}

/** Ends the session in the database, not only in the browser. */
export async function signOut(): Promise<void> {
  const token = await readSessionCookie();
  if (looksLikeToken(token)) await revokeSession(token);
  await clearSessionCookie();
  redirect('/login');
}
