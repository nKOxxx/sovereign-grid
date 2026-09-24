// server/src/auth/passwords.js
// Password hashing + verification.
//
// HASHING CHOICE (justification):
//   We use node:crypto scrypt (N=16384, r=8, p=1, 32-byte key, 16-byte random
//   salt) instead of argon2. Both are memory-hard KDFs suitable for password
//   storage; scrypt is preferred here because it ships in node:crypto and so
//   adds ZERO heavy native dependencies (argon2 is a native addon that needs a
//   compiler toolchain and a build step). This honours the "no new heavy deps"
//   constraint while keeping the memory-hard, rate-resistant properties that
//   argon2 exists to provide.
//
//   Format (self-describing, future-proof):  scrypt$N$r$p$<salt_b64>$<hash_b64>
//   - Per-password random 16-byte salt: two equal passwords never share a hash.
//   - Constant-time comparison via crypto.timingSafeEqual: mitigates timing
//     side-channels when verifying.
//   - Parameters are embedded so we can raise N later without breaking stored
//     hashes (verify reads N/r/p from the stored string).
//
//   Plaintext is NEVER stored. The DB column users.password_hash holds only
//   this encoded string.

import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)

// Defaults: OWASP-recommended scrypt parameters (N=2^14, r=8, p=1).
const N = 16384
const R = 8
const P = 1
const KEYLEN = 32
const SALT_LEN = 16
const PREFIX = 'scrypt'

/**
 * Hash a plaintext password into the self-describing storage string.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_LEN)
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P })
  return [
    PREFIX,
    N,
    R,
    P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$')
}

/**
 * Verify a plaintext password against a stored encoded hash.
 * @param {string} password
 * @param {string} stored  the encoded string (or null for legacy users)
 * @returns {Promise<boolean>} false for missing/malformed stored hashes
 */
export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== PREFIX) return false

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts
  const n = Number(nStr)
  const r = Number(rStr)
  const p = Number(pStr)
  if (![n, r, p].every(Number.isInteger) || n <= 0 || r <= 0 || p <= 0) return false

  const expected = Buffer.from(hashB64, 'base64')
  if (expected.length !== KEYLEN) return false

  try {
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), KEYLEN, { N: n, r, p })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// Password policy used by zod on registration (kept here so tests can assert it).
export const PASSWORD_MIN_LENGTH = 8
