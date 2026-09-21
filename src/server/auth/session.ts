import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import type { GovernmentRole } from '@/lib/roles';
import { findSessionUser, type AccountKind, type SessionUser } from '@/server/auth/accounts';
import { looksLikeToken, SESSION_COOKIE } from '@/server/auth/tokens';

/**
 * The Data Access Layer for identity.
 *
 * Every page and Server Action that needs to know who is acting asks here, and
 * nothing else decides it. In particular the acting business or creator comes
 * from the signed-in account's binding, never from a form field — any caller
 * can put any id in a form, so an id taken from the request is a claim, not an
 * identity.
 *
 * Checks happen in pages and actions rather than layouts: a layout does not
 * re-render on navigation and does not stop nested segments or Server Actions
 * from running (Next.js authentication guide, "Layouts and auth checks").
 * proxy.ts only redirects early when there is no cookie at all.
 */

/** Memoised per request, so a page and its components share one lookup. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!looksLikeToken(token)) return null;
  return findSessionUser(token);
});

const SURFACE: Record<AccountKind, string> = {
  GOVERNMENT: 'government',
  PARTNER: 'partner',
  CREATOR: 'creator',
};

export const CHANGE_PASSWORD_PATH = '/account/password';

/**
 * The signed-in account for Server Actions, or null. An account still on a
 * temporary password counts as not signed in for every action except
 * changing it: the password was chosen by someone else, and was shown to them.
 */
async function actingUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && !user.mustChangePassword ? user : null;
}

/** For pages: the signed-in account of that kind, or a redirect to sign in. */
async function requireKind(kind: AccountKind): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?as=${SURFACE[kind]}`);
  if (user.kind !== kind) redirect(`/login?as=${SURFACE[kind]}&wrong=${SURFACE[user.kind]}`);
  if (user.mustChangePassword) redirect(`${CHANGE_PASSWORD_PATH}?required=1`);
  return user;
}

/** For the password page: any signed-in account, temporary password or not. */
export async function requireSignedIn(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** For account administration actions: the acting administrator, or null. */
export async function getActingAdministrator(): Promise<(SessionUser & { governmentRole: 'ADMINISTRATOR' }) | null> {
  const user = await actingUser();
  return user?.kind === 'GOVERNMENT' && user.governmentRole === 'ADMINISTRATOR'
    ? (user as SessionUser & { governmentRole: 'ADMINISTRATOR' })
    : null;
}

export async function requireGovernment(): Promise<SessionUser & { governmentRole: GovernmentRole }> {
  const user = await requireKind('GOVERNMENT');
  // createAccount refuses a government account without a role; this is the
  // belt to that brace, and it fails closed.
  if (!user.governmentRole) redirect('/login?as=government');
  return user as SessionUser & { governmentRole: GovernmentRole };
}

export async function requirePartner(): Promise<SessionUser & { businessId: string }> {
  const user = await requireKind('PARTNER');
  if (!user.businessId) redirect('/login?as=partner');
  return user as SessionUser & { businessId: string };
}

export async function requireCreator(): Promise<SessionUser & { creatorId: string }> {
  const user = await requireKind('CREATOR');
  if (!user.creatorId) redirect('/login?as=creator');
  return user as SessionUser & { creatorId: string };
}

/**
 * For Server Actions: the acting government role, or null when the caller is
 * not signed in with a government account. `can(null, …)` is always false, so
 * an anonymous caller is refused by the same check that refuses a viewer.
 */
export async function getGovernmentRole(): Promise<GovernmentRole | null> {
  const user = await actingUser();
  return user?.kind === 'GOVERNMENT' ? (user.governmentRole ?? null) : null;
}

/** For Server Actions: the business the caller acts for, or null. */
export async function getActingBusinessId(): Promise<string | null> {
  const user = await actingUser();
  return user?.kind === 'PARTNER' ? (user.businessId ?? null) : null;
}

/** For Server Actions: the creator the caller acts as, or null. */
export async function getActingCreatorId(): Promise<string | null> {
  const user = await actingUser();
  return user?.kind === 'CREATOR' ? (user.creatorId ?? null) : null;
}

export const NOT_SIGNED_IN = 'Sign in to do that.';
