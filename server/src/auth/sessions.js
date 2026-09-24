// server/src/auth/sessions.js
// Bearer-session management for /api/auth and the requireAuth middleware.
//
//   * createSession(userId, role)  -> issues a random 32-byte token, stores
//     only its SHA-256 hash in `sessions`, returns { token, expiresAt }.
//   * verifySession(token)         -> { userId, role } | null. Looks up by the
//     token hash through the security-definer auth_session_by_hash() so the
//     lookup is valid regardless of the current RLS user (we don't know who
//     they are until we resolve the token). Expired sessions resolve to null.
//   * destroySession(token, ...)   -> invalidates the session (logout).
//
//   The raw token is returned to the client exactly once; only the hash is ever
//   persisted, so a DB leak does not yield usable bearer credentials.
//
//   TTL is configurable via SESSION_TTL_DAYS (default 7). Tests pass an explicit
//   pool bound to their scratch database; production uses the module default.

import { createHash, randomBytes } from 'node:crypto'
import { defaultPool, withUser } from '../db/pool.js'

const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 7)

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function newToken() {
  return randomBytes(32).toString('base64url')
}

/**
 * Issue a session for a user.
 * @param {string} userId
 * @param {'buyer'|'seller'|'operator'} role  RLS role used to set the session
 *                                            self-context for the INSERT.
 * @param {import('pg').Pool} [pool]
 * @returns {Promise<{token: string, expiresAt: Date}>}
 */
export async function createSession(userId, role, pool = defaultPool) {
  const token = newToken()
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000)
  await withUser(userId, role, async (c) => {
    await c.query(
      'INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, sha256(token), expiresAt],
    )
  }, pool)
  return { token, expiresAt }
}

/**
 * Resolve a bearer token to its owner, or null if invalid/expired.
 * @param {string} token
 * @param {import('pg').Pool} [pool]
 * @returns {Promise<{userId: string, role: string}|null>}
 */
export async function verifySession(token, pool = defaultPool) {
  if (!token || typeof token !== 'string') return null
  const hash = sha256(token)
  const { rows } = await pool.query('SELECT * FROM auth_session_by_hash($1)', [hash])
  if (!rows.length) return null
  return { userId: rows[0].user_id, role: rows[0].role }
}

/**
 * Invalidate a session (logout). Deletes the row scoped to the acting user.
 * @param {string} token
 * @param {string} userId
 * @param {'buyer'|'seller'|'operator'} role
 * @param {import('pg').Pool} [pool]
 */
export async function destroySession(token, userId, role, pool = defaultPool) {
  const hash = sha256(token)
  await withUser(userId, role, async (c) => {
    await c.query('DELETE FROM sessions WHERE token_hash = $1', [hash])
  }, pool)
}

/** Current TTL in days (used to document / assert default). */
export const sessionTtlDays = TTL_DAYS
