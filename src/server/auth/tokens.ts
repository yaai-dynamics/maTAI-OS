import { createHash, randomBytes } from 'node:crypto';

/**
 * Session tokens.
 *
 * The cookie carries 256 random bits. The database stores only their SHA-256,
 * so a copy of the AuthSession table — a backup, a log, a leaked dump — cannot
 * be turned back into a working cookie. A fast hash is right here, unlike for
 * passwords: the input already has full entropy, so there is nothing for a
 * slow KDF to protect.
 */

export const SESSION_COOKIE = 'mt_session';

/** Absolute lifetime. A working day plus margin; re-authenticate after. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const newSessionToken = (): string => randomBytes(32).toString('base64url');

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Shape check before touching the database, so junk cookies cost nothing. */
export const looksLikeToken = (value: string | undefined): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
