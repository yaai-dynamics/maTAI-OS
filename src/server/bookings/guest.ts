import { cookies } from 'next/headers';

import { hashToken, looksLikeToken, newSessionToken } from '@/server/auth/tokens';

/**
 * Which browser made a booking.
 *
 * Tourists have no account, so ownership of a booking is a random cookie held
 * by the browser that made the request. The database stores only its hash, as
 * with sign-in sessions. The private link in each booking is the second way
 * in, for a traveller who changes device or clears their cookies.
 *
 * This is deliberately separate from the anonymous analytics session: in demo
 * mode every tourist shares one analytics id, and sharing a booking — with a
 * name and phone number on it — would be a disclosure.
 */

export const GUEST_COOKIE = 'mt_guest';
const GUEST_MAX_AGE_S = 180 * 24 * 60 * 60;

/** The hash identifying this browser's bookings, or null if it has none. */
export async function readGuestOwner(): Promise<string | null> {
  const value = (await cookies()).get(GUEST_COOKIE)?.value;
  return looksLikeToken(value) ? hashToken(value) : null;
}

/** As above, creating the cookie first. Server Actions and route handlers only. */
export async function ensureGuestOwner(): Promise<string> {
  const store = await cookies();
  const existing = store.get(GUEST_COOKIE)?.value;
  if (looksLikeToken(existing)) return hashToken(existing);

  const token = newSessionToken();
  store.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_MAX_AGE_S,
  });
  return hashToken(token);
}
