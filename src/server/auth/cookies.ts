import { cookies } from 'next/headers';

import { SESSION_COOKIE } from '@/server/auth/tokens';

/**
 * The session cookie.
 *
 * httpOnly so page script cannot read it, SameSite=Lax so it is not sent on
 * cross-site form posts, and Secure outside development so it never travels in
 * clear text. It holds an opaque token and nothing else: no role, no id, nothing
 * a caller could edit to change who they are.
 */
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function readSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
