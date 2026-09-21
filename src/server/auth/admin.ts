import { randomInt, randomUUID } from 'node:crypto';

import { Prisma, type AccountAuditAction } from '@prisma/client';

import type { GovernmentRole } from '@/lib/roles';
import { prisma } from '@/server/data/client';
import { normaliseEmail, type AccountKind } from '@/server/auth/accounts';
import { hashPassword } from '@/server/auth/password';

/**
 * Account administration.
 *
 * The department issues its own staff accounts: a government role grants
 * campaign launch and payout approval, so it cannot be self-registered.
 * There is no email channel, so a new or reset account gets a temporary
 * password that the administrator hands over in person. It is shown once,
 * stored only as a hash, expires, and must be replaced at first sign-in.
 *
 * Two rules protect the department from locking itself out: an
 * administrator cannot disable, demote or reset themselves, and the last
 * active administrator cannot be removed by anyone. The second is checked
 * inside a serializable transaction, so two administrators demoting each
 * other at the same moment cannot both succeed.
 */

export interface AdminActor {
  id: string;
  email: string;
}

export type AdminResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): AdminResult<T> => ({ ok: true, value });
const fail = (error: string): AdminResult<never> => ({ ok: false, error });

/** How long a temporary password works. Long enough to hand over, short enough to matter. */
export const TEMPORARY_PASSWORD_HOURS = 72;

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** 16 characters, about 92 bits, grouped so it can be read out: Kd7m-Qx2P-... */
export function newTemporaryPassword(): string {
  const chars = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return [0, 4, 8, 12].map((start) => chars.slice(start, start + 4).join('')).join('-');
}

const NOT_FOUND = 'That account could not be found.';
const RACED = 'Another change to accounts was made at the same moment. Reload and try again.';

export interface AccountSummary {
  id: string;
  email: string;
  displayName: string;
  kind: AccountKind;
  governmentRole: GovernmentRole | null;
  businessId: string | null;
  creatorId: string | null;
  disabled: boolean;
  locked: boolean;
  mustChangePassword: boolean;
  passwordExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  openSessions: number;
}

export async function listAccounts(at: Date = new Date()): Promise<AccountSummary[]> {
  const rows = await prisma.userAccount.findMany({
    orderBy: [{ kind: 'asc' }, { email: 'asc' }],
    include: { _count: { select: { sessions: { where: { expiresAt: { gt: at } } } } } },
  });
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    kind: row.kind,
    governmentRole: row.governmentRole,
    businessId: row.businessId,
    creatorId: row.creatorId,
    disabled: row.disabled,
    locked: Boolean(row.lockedUntil && row.lockedUntil > at),
    mustChangePassword: row.mustChangePassword,
    passwordExpiresAt: row.passwordExpiresAt?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    openSessions: row._count.sessions,
  }));
}

export interface AuditEntry {
  id: string;
  action: AccountAuditAction;
  actorEmail: string;
  targetEmail: string;
  detail: string | null;
  at: string;
}

export async function recentAccountAudit(limit = 30): Promise<AuditEntry[]> {
  const rows = await prisma.accountAuditEvent.findMany({ orderBy: { at: 'desc' }, take: limit });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorEmail: row.actorEmail,
    targetEmail: row.targetEmail,
    detail: row.detail,
    at: row.at.toISOString(),
  }));
}

type Tx = Prisma.TransactionClient;

const audit = (
  tx: Tx,
  actor: AdminActor,
  target: { id: string; email: string },
  action: AccountAuditAction,
  detail: string | null,
  at: Date,
) =>
  tx.accountAuditEvent.create({
    data: {
      id: `aud-${randomUUID()}`,
      action,
      actorId: actor.id,
      actorEmail: actor.email,
      targetId: target.id,
      targetEmail: target.email,
      detail,
      at,
    },
  });

/** Active administrators other than `exceptId`, read inside the transaction. */
const otherActiveAdministrators = (tx: Tx, exceptId: string) =>
  tx.userAccount.count({
    where: { kind: 'GOVERNMENT', governmentRole: 'ADMINISTRATOR', disabled: false, id: { not: exceptId } },
  });

/**
 * Runs an account change serializably. A write conflict between two
 * concurrent changes surfaces as P2034 (or a MySQL deadlock), and is reported
 * rather than retried: the administrator should see what the other change did.
 */
async function serializable<T>(work: (tx: Tx) => Promise<AdminResult<T>>): Promise<AdminResult<T>> {
  try {
    return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = (error as Error).message ?? '';
    if (code === 'P2034' || /deadlock|serializ|write conflict/i.test(message)) return fail(RACED);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */

export interface IssuedPassword {
  accountId: string;
  email: string;
  temporaryPassword: string;
  expiresAt: string;
}

export async function issueGovernmentAccount(
  actor: AdminActor,
  input: { email: string; displayName: string; role: GovernmentRole },
  at: Date = new Date(),
): Promise<AdminResult<IssuedPassword>> {
  const email = normaliseEmail(input.email);
  const displayName = input.displayName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) return fail('Enter a valid email address.');
  if (displayName.length < 2 || displayName.length > 120) return fail('Enter the person’s name.');

  const temporaryPassword = newTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const expiresAt = new Date(at.getTime() + TEMPORARY_PASSWORD_HOURS * 60 * 60 * 1000);

  return serializable(async (tx) => {
    if (await tx.userAccount.findUnique({ where: { email } })) return fail('An account with that email already exists.');
    const id = `acct-${randomUUID()}`;
    await tx.userAccount.create({
      data: {
        id,
        email,
        displayName,
        passwordHash,
        kind: 'GOVERNMENT',
        governmentRole: input.role,
        mustChangePassword: true,
        passwordExpiresAt: expiresAt,
        createdAt: at,
      },
    });
    await audit(tx, actor, { id, email }, 'ISSUED', `Issued as ${input.role}.`, at);
    return ok({ accountId: id, email, temporaryPassword, expiresAt: expiresAt.toISOString() });
  });
}

export async function changeGovernmentRole(
  actor: AdminActor,
  targetId: string,
  role: GovernmentRole,
  at: Date = new Date(),
): Promise<AdminResult> {
  if (targetId === actor.id) return fail('You cannot change your own role. Ask another administrator.');
  return serializable(async (tx) => {
    const target = await tx.userAccount.findUnique({ where: { id: targetId } });
    if (!target) return fail(NOT_FOUND);
    if (target.kind !== 'GOVERNMENT') return fail('Only government accounts have a role.');
    if (target.governmentRole === role) return fail('The account already has that role.');
    if (target.governmentRole === 'ADMINISTRATOR' && !target.disabled && (await otherActiveAdministrators(tx, target.id)) === 0) {
      return fail('This is the last active administrator. Make someone else an administrator first.');
    }
    await tx.userAccount.update({ where: { id: target.id }, data: { governmentRole: role } });
    await audit(tx, actor, target, 'ROLE_CHANGED', `${target.governmentRole} → ${role}.`, at);
    return ok(undefined);
  });
}

export async function setAccountDisabled(
  actor: AdminActor,
  targetId: string,
  disabled: boolean,
  reason: string | undefined,
  at: Date = new Date(),
): Promise<AdminResult> {
  if (targetId === actor.id) return fail('You cannot disable your own account.');
  return serializable(async (tx) => {
    const target = await tx.userAccount.findUnique({ where: { id: targetId } });
    if (!target) return fail(NOT_FOUND);
    if (target.disabled === disabled) return fail(disabled ? 'The account is already disabled.' : 'The account is already active.');
    if (
      disabled &&
      target.kind === 'GOVERNMENT' &&
      target.governmentRole === 'ADMINISTRATOR' &&
      (await otherActiveAdministrators(tx, target.id)) === 0
    ) {
      return fail('This is the last active administrator and cannot be disabled.');
    }
    await tx.userAccount.update({ where: { id: target.id }, data: { disabled } });
    // Sessions already stop working for a disabled account; deleting them
    // also means re-enabling it does not quietly revive them.
    if (disabled) await tx.authSession.deleteMany({ where: { userId: target.id } });
    await audit(tx, actor, target, disabled ? 'DISABLED' : 'ENABLED', reason?.trim() || null, at);
    return ok(undefined);
  });
}

export async function unlockAccount(actor: AdminActor, targetId: string, at: Date = new Date()): Promise<AdminResult> {
  return serializable(async (tx) => {
    const target = await tx.userAccount.findUnique({ where: { id: targetId } });
    if (!target) return fail(NOT_FOUND);
    if (!target.lockedUntil || target.lockedUntil <= at) return fail('The account is not locked.');
    await tx.userAccount.update({ where: { id: target.id }, data: { lockedUntil: null, failedLoginCount: 0 } });
    await audit(tx, actor, target, 'UNLOCKED', null, at);
    return ok(undefined);
  });
}

export async function resetAccountPassword(
  actor: AdminActor,
  targetId: string,
  at: Date = new Date(),
): Promise<AdminResult<IssuedPassword>> {
  if (targetId === actor.id) return fail('Change your own password from your account page instead.');
  const temporaryPassword = newTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const expiresAt = new Date(at.getTime() + TEMPORARY_PASSWORD_HOURS * 60 * 60 * 1000);

  return serializable(async (tx) => {
    const target = await tx.userAccount.findUnique({ where: { id: targetId } });
    if (!target) return fail(NOT_FOUND);
    if (target.disabled) return fail('Enable the account before resetting its password.');
    await tx.userAccount.update({
      where: { id: target.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordExpiresAt: expiresAt,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    // Whoever had the old password is signed out everywhere.
    await tx.authSession.deleteMany({ where: { userId: target.id } });
    await audit(tx, actor, target, 'PASSWORD_RESET', null, at);
    return ok({ accountId: target.id, email: target.email, temporaryPassword, expiresAt: expiresAt.toISOString() });
  });
}
