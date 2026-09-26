// server/src/middleware/auth.js
// requireAuth — authenticates a Bearer token and populates req.user = { id, role }.
//
//   * Parses `Authorization: Bearer <token>`.
//   * Resolves it via verifySession() (checks non-expired session + token hash).
//   * On success: req.user = { id, role }, then next().
//   * On any failure (missing/malformed header, unknown/expired token): a
//     GENERIC 401 — we never reveal whether a token was merely malformed vs.
//     unknown, and never leak session details.
//
//   Chain this BEFORE requireRole(...) from ./roles.js (which only checks
//   req.user.role). requireAuth is the thing that TURNS A TOKEN INTO A USER.

import { verifySession } from '../auth/sessions.js'

const BEARER = /^Bearer\s+(.+)$/i

/**
 * @param {{pool?: import('pg').Pool}} [opts]
 * @returns {(req, res, next) => Promise<void>}
 */
export function requireAuth({ pool } = {}) {
  return async function authGuard(req, res, next) {
    const header = req.headers.authorization || ''
    const match = BEARER.exec(header)
    if (!match) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } })
      return
    }

    let session
    try {
      session = await verifySession(match[1], pool)
    } catch (err) {
      next(err)
      return
    }

    if (!session) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } })
      return
    }

    req.user = { id: session.userId, role: session.role, emailVerified: session.emailVerified }
    req.token = match[1]
    next()
  }
}
