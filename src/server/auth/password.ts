import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing.
 *
 * scrypt from node:crypto rather than a native argon2 binding: no compiler
 * toolchain on Windows, no binary to fall out of date, and scrypt is a
 * memory-hard KDF that OWASP lists alongside argon2id.
 *
 * Parameters follow the OWASP Password Storage Cheat Sheet's scrypt table:
 * N=2^15, r=8, p=3 is one of its listed equivalents of the N=2^17, r=8, p=1
 * baseline, trading memory for parallelism so a login costs ~32 MB rather than
 * ~128 MB on a shared server.
 *
 * The stored form is self-describing — `scrypt$N$r$p$salt$hash` — so the cost
 * can be raised later without invalidating existing hashes: verification uses
 * the parameters recorded with each hash, not the current defaults.
 */

const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// 128 * N * r bytes, plus headroom. Node's 32 MB default is exactly the
// requirement at these parameters and would throw on some platforms.
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, options: ScryptOptions & { keylen: number }): Promise<Buffer> {
  const { keylen, ...rest } = options;
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize('NFKC'), salt, keylen, rest, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, { N, r: R, p: P, maxmem: MAX_MEMORY, keylen: KEY_LENGTH });
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/**
 * Constant-time comparison against a stored hash. Returns false for anything
 * malformed rather than throwing, so a corrupt row reads as a failed login and
 * never as a crash that reveals which accounts exist.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [string, string, string, string, string, string];
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (![n, r, p].every((value) => Number.isInteger(value) && value > 0)) return false;

  const expected = Buffer.from(hashRaw, 'base64');
  if (expected.length === 0) return false;

  const actual = await derive(password, Buffer.from(saltRaw, 'base64'), {
    N: n,
    r,
    p,
    maxmem: Math.max(MAX_MEMORY, 256 * n * r),
    keylen: expected.length,
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A real hash of a random password, computed once. Used when a login names an
 * email that has no account, so the unknown-email path costs the same scrypt
 * work as the wrong-password path and response time does not reveal which
 * emails are registered.
 */
let decoy: Promise<string> | undefined;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(24).toString('base64'));
  return decoy;
}

/** The minimum the platform accepts. Length beats composition rules. */
export const PASSWORD_MIN_LENGTH = 10;
