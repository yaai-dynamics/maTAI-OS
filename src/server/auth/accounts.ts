import { randomUUID } from 'node:crypto';

import type { GovernmentRole } from '@/lib/roles';
import { prisma } from '@/server/data/client';
import { decoyHash, hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from '@/server/auth/password';
import { hashToken, newSessionToken, SESSION_TTL_MS } from '@/server/auth/tokens';

/**
 * Accounts and sessions.
 *
 * Unlike tourism data, identity is never served from the in-memory cache: it
 * reads and writes MySQL on every call. A revoked session or a disabled
 * account has to stop working immediately and in every process, which a
 * per-process cache cannot promise.
 */

export type AccountKind = 'GOVERNMENT' | 'PARTNER' | 'CREATOR';

/** What the rest of the application may know about the signed-in person. */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  kind: AccountKind;
  governmentRole?: GovernmentRole;
  businessId?: string;
  creatorId?: string;
  /** Signed in with a temporary password: may do nothing but choose a new one. */
  mustChangePassword: boolean;
}

/** Consecutive failures before a temporary lock, and how long it lasts. */
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

type AccountRow = {
  id: string;
  email: string;
  displayName: string;
  kind: AccountKind;
  governmentRole: GovernmentRole | null;
  businessId: string | null;
  creatorId: string | null;
  mustChangePassword: boolean;
};

const toSessionUser = (row: AccountRow): SessionUser => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
  kind: row.kind,
  ...(row.governmentRole ? { governmentRole: row.governmentRole } : {}),
  ...(row.businessId ? { businessId: row.businessId } : {}),
  ...(row.creatorId ? { creatorId: row.creatorId } : {}),
  mustChangePassword: row.mustChangePassword,
});

/**
 * An account whose business or creator profile has been deleted (the foreign
 * key sets it to null) grants nothing, so it must not count as signed in.
 * Otherwise the sign-in page would offer "Continue" into an interface that
 * sends it straight back to sign in.
 */
const isUsable = (row: AccountRow): boolean =>
  (row.kind === 'GOVERNMENT' && row.governmentRole !== null) ||
  (row.kind === 'PARTNER' && row.businessId !== null) ||
  (row.kind === 'CREATOR' && row.creatorId !== null);

export type AuthResult =
  | { ok: true; user: SessionUser; token: string; expiresAt: Date }
  | { ok: false; error: string };

/** One message for every credential failure, so the response names no account. */
export const INVALID_CREDENTIALS = 'That email and password do not match an account.';

export async function authenticate(
  emailInput: string,
  password: string,
  userAgent?: string,
): Promise<AuthResult> {
  const email = normaliseEmail(emailInput);
  const account = await prisma.userAccount.findUnique({ where: { email } });

  if (!account) {
    // Same scrypt cost as a real check, so timing does not reveal the email.
    await verifyPassword(password, await decoyHash());
    return { ok: false, error: INVALID_CREDENTIALS };
  }

  const at = new Date();

  if (account.lockedUntil && account.lockedUntil > at) {
    const minutes = Math.ceil((account.lockedUntil.getTime() - at.getTime()) / 60_000);
    return {
      ok: false,
      error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    };
  }

  const valid = await verifyPassword(password, account.passwordHash);

  if (!valid) {
    const failures = account.failedLoginCount + 1;
    await prisma.userAccount.update({
      where: { id: account.id },
      data: {
        failedLoginCount: failures >= LOCKOUT_THRESHOLD ? 0 : failures,
        lockedUntil: failures >= LOCKOUT_THRESHOLD ? new Date(at.getTime() + LOCKOUT_MS) : null,
      },
    });
    return { ok: false, error: INVALID_CREDENTIALS };
  }

  // Checked after the password, so a disabled account is not distinguishable
  // from a wrong password to someone who does not hold the credentials.
  if (account.disabled) {
    return { ok: false, error: 'This account has been disabled. Contact the Tourism Department.' };
  }
  if (account.passwordExpiresAt && account.passwordExpiresAt <= at) {
    return {
      ok: false,
      error: 'This temporary password has expired. Ask an administrator to issue a new one.',
    };
  }
  if (!isUsable(account)) {
    return {
      ok: false,
      error: 'This account is no longer linked to a business or creator profile. Contact the Tourism Department.',
    };
  }

  await prisma.userAccount.update({
    where: { id: account.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: at },
  });

  const { token, expiresAt } = await createSession(account.id, userAgent);
  // Housekeeping piggybacks on logins rather than needing a scheduler.
  await prisma.authSession.deleteMany({ where: { expiresAt: { lt: at } } });

  return { ok: true, user: toSessionUser(account), token, expiresAt };
}

export async function createSession(
  userId: string,
  userAgent?: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.authSession.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      userAgent: userAgent ? userAgent.slice(0, 512) : null,
    },
  });
  return { token, expiresAt };
}

/** The account behind a cookie, or null if the session is gone, expired, disabled or unbound. */
export async function findSessionUser(token: string): Promise<SessionUser | null> {
  const session = await prisma.authSession.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.authSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.disabled || !isUsable(session.user)) return null;

  return toSessionUser(session.user);
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.authSession.deleteMany({ where: { id: hashToken(token) } });
}

/**
 * Checked before a registration writes its business or creator profile, so a
 * taken email is refused up front instead of leaving an orphaned record.
 */
export async function isEmailRegistered(email: string): Promise<boolean> {
  return (await prisma.userAccount.count({ where: { email: normaliseEmail(email) } })) > 0;
}

export interface NewAccount {
  email: string;
  password: string;
  displayName: string;
  kind: AccountKind;
  governmentRole?: GovernmentRole;
  businessId?: string;
  creatorId?: string;
}

/**
 * Creates an account. The binding rules are enforced here as well as in the
 * callers, because an account that is both a partner and a creator, or a
 * government account without a role, is a privilege bug waiting to happen.
 */
export async function createAccount(input: NewAccount): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (input.kind === 'GOVERNMENT' && !input.governmentRole) {
    return { ok: false, error: 'A government account needs a role.' };
  }
  if (input.kind !== 'GOVERNMENT' && input.governmentRole) {
    return { ok: false, error: 'Only government accounts carry a role.' };
  }
  if (input.kind === 'PARTNER' && (!input.businessId || input.creatorId)) {
    return { ok: false, error: 'A partner account must be bound to one business.' };
  }
  if (input.kind === 'CREATOR' && (!input.creatorId || input.businessId)) {
    return { ok: false, error: 'A creator account must be bound to one creator profile.' };
  }

  const email = normaliseEmail(input.email);
  if (await prisma.userAccount.findUnique({ where: { email } })) {
    return { ok: false, error: 'An account with that email already exists.' };
  }

  const id = `acct-${randomUUID()}`;
  await prisma.userAccount.create({
    data: {
      id,
      email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName.trim(),
      kind: input.kind,
      governmentRole: input.governmentRole ?? null,
      businessId: input.businessId ?? null,
      creatorId: input.creatorId ?? null,
    },
  });
  return { ok: true, id };
}

/**
 * The holder changes their own password. Every other session of the account
 * is ended — the usual reason to change a password is suspecting someone else
 * has it — and the one making the change is kept.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionToken: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const account = await prisma.userAccount.findUnique({ where: { id: userId } });
  if (!account || account.disabled) return { ok: false, error: 'Sign in again to change your password.' };
  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    return { ok: false, error: 'Your current password is not right.' };
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Choose a password of at least ${PASSWORD_MIN_LENGTH} characters.` };
  }
  if (newPassword === currentPassword) {
    return { ok: false, error: 'Choose a password different from the current one.' };
  }
  if (newPassword.toLowerCase().includes(account.email.split('@')[0]!.toLowerCase())) {
    return { ok: false, error: 'Choose a password that does not contain your email address.' };
  }

  const at = new Date();
  const keep = keepSessionToken ? hashToken(keepSessionToken) : null;
  await prisma.$transaction([
    prisma.userAccount.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordExpiresAt: null,
        passwordChangedAt: at,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.authSession.deleteMany({ where: { userId, ...(keep ? { id: { not: keep } } : {}) } }),
    prisma.accountAuditEvent.create({
      data: {
        id: `aud-${randomUUID()}`,
        action: 'PASSWORD_CHANGED',
        actorId: userId,
        actorEmail: account.email,
        targetId: userId,
        targetEmail: account.email,
        detail: 'Changed by the account holder.',
        at,
      },
    }),
  ]);
  return { ok: true };
}
