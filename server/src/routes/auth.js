// server/src/routes/auth.js
// /api/auth — register, login, logout, me, plus the account-trust bundle:
// verify, resend, reset-request, reset.
//
// Security notes:
//   * Passwords are hashed with scrypt BEFORE touching the DB (passwords.js) —
//     plaintext never reaches Postgres.
//   * Login is rate-limited; register / resend / reset-request are rate-limited
//     too (10/15min/IP, in-memory, per-endpoint bucket). See app.js for the
//     broader 60/min write guard covering every /api write.
//   * operator self-registration is rejected at the schema boundary
//     (auth_create_user RAISEs) AND at the route (zod enum excludes it).
//   * Wrong-password and unknown-email both yield a generic 401; reset-request
//     and resend always yield 200 — we never reveal whether an email exists.
//   * The user object returned to the client NEVER includes password_hash.
//   * All DB access inside a transaction passes through withUser() so RLS scopes
//     every row to the acting user (sessions self-context, /me self-row).
//
// EMAIL VERIFICATION (no SMTP configured — see verification.js + 0009 header):
//   * register creates an unverified account and a 'verify' one-time token. The
//     raw token is logged via console.info `VERIFY_TOKEN:` in dev, or surfaced
//     to operators via /api/operator/verifications in production.
//   * /verify consumes the single-use token and marks the account verified.
//   * /resend issues a fresh 'verify' token for an unverified account.
//   * /reset-request issues a 'reset' token (always 200, no enumeration);
//     /reset consumes it, sets a new password, and logs out every session.
//   TODO(M) remove token_raw + operator hand-off once SMTP email is wired.

import { Router } from 'express'
import { z } from 'zod'
import { hashPassword, verifyPassword, PASSWORD_MIN_LENGTH } from '../auth/passwords.js'
import { createSession, destroySession } from '../auth/sessions.js'
import {
  sha256,
  newVerificationToken,
  surfaceVerificationToken,
  VERIFY_TTL_MS,
  RESET_TTL_MS,
} from '../auth/verification.js'
import { requireAuth } from '../middleware/auth.js'
import { createRateLimiter } from '../middleware/rate-limit.js'
import { withUser } from '../db/pool.js'

const email = z.string().trim().toLowerCase().email('valid email required')
const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `password must be at least ${PASSWORD_MIN_LENGTH} characters`)

const registerSchema = z.object({
  email,
  password,
  role: z.enum(['buyer', 'seller']), // operator is intentionally absent
  displayName: z.string().trim().max(120).optional(),
})

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'password required'),
})

const verifySchema = z.object({ token: z.string().min(1, 'token required') })
const emailSchema = z.object({ email })
const resetSchema = z.object({
  token: z.string().min(1, 'token required'),
  password,
})

const AUTH_STRICT = { limit: 10, windowMs: 15 * 60 * 1000 } // 10/15min/IP
const PASSWORD_RESET_TTL = RESET_TTL_MS

function publicUser(row) {
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    displayName: row.display_name ?? null,
    createdAt: row.created_at,
    emailVerified: row.email_verified === true,
  }
}

/**
 * Issue a one-time token against a user and surface it on the operator/dev
 * channel. Returns the raw token (callers only need it for logging/returns).
 */
async function issueToken(pool, userId, email, purpose) {
  const token = newVerificationToken()
  const ttl = purpose === 'reset' ? PASSWORD_RESET_TTL : VERIFY_TTL_MS
  const expiresAt = new Date(Date.now() + ttl)
  await pool.query('SELECT * FROM auth_create_verification($1,$2,$3,$4,$5)', [
    userId,
    purpose,
    token,
    sha256(token),
    expiresAt,
  ])
  surfaceVerificationToken(email, token, purpose)
  return token
}

/** Single-use verification of an account. Returns userId or null. */
async function consumeVerify(pool, token) {
  const { rows } = await pool.query('SELECT * FROM auth_consume_verify($1)', [sha256(token)])
  return rows[0]?.auth_consume_verify ?? null
}

/**
 * @param {{pool: import('pg').Pool}} opts
 */
export function createAuthRouter({ pool }) {
  const router = Router()

  // Per-endpoint strict buckets (10/15min/IP). Exposed via router.resetRateLimiters
  // so the test harness (and a deploy-restart) can clear them without a new app.
  const loginLimiter = createRateLimiter(AUTH_STRICT)
  const registerLimiter = createRateLimiter(AUTH_STRICT)
  const resendLimiter = createRateLimiter(AUTH_STRICT)
  const resetRequestLimiter = createRateLimiter(AUTH_STRICT)
  router.resetRateLimiters = () =>
    [loginLimiter, registerLimiter, resendLimiter, resetRequestLimiter].forEach((l) => l.reset())

  router.post('/register', registerLimiter.middleware, async (req, res, next) => {
    try {
      const body = registerSchema.parse(req.body)
      const passwordHash = await hashPassword(body.password)

      let userId
      try {
        const { rows } = await pool.query(
          'SELECT * FROM auth_create_user($1, $2, $3, $4)',
          [body.email, body.role, body.displayName ?? null, passwordHash],
        )
        userId = rows[0].auth_create_user
      } catch (err) {
        if (err && err.code === '23505') {
          res.status(409).json({ error: { code: 'conflict', message: 'Email already registered' } })
          return
        }
        throw err
      }

      // New accounts are created UNVERIFIED and require email verification
      // before gated actions (create listing / accept deal) are allowed.
      await issueToken(pool, userId, body.email, 'verify')

      const { token } = await createSession(userId, body.role, pool)
      const { rows } = await withUser(userId, body.role, async (c) => {
        return c.query(
          'SELECT id, role, email, display_name, created_at, email_verified FROM users WHERE id = $1',
          [userId],
        )
      }, pool)

      res.status(201).json({
        token,
        user: publicUser(rows[0]),
        verificationRequired: true,
      })
    } catch (err) {
      next(err)
    }
  })

  router.post('/login', loginLimiter.middleware, async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body)
      const { rows } = await pool.query('SELECT * FROM auth_user_by_email($1)', [body.email])
      const row = rows[0]
      if (!row) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid credentials' } })
        return
      }
      if (row.password_hash == null) {
        // Legacy/operator seed user has no password and cannot self-authenticate.
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid credentials' } })
        return
      }
      const ok = await verifyPassword(body.password, row.password_hash)
      if (!ok) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid credentials' } })
        return
      }

      const { token } = await createSession(row.id, row.role, pool)
      res.status(200).json({ token, user: publicUser(row) })
    } catch (err) {
      next(err)
    }
  })

  // ---- email verification ------------------------------------------------
  router.post('/verify', async (req, res, next) => {
    try {
      const body = verifySchema.parse(req.body)
      const userId = await consumeVerify(pool, body.token)
      if (!userId) {
        res.status(400).json({ error: { code: 'invalid_token', message: 'Invalid or expired token' } })
        return
      }
      res.status(200).json({ verified: true })
    } catch (err) {
      next(err)
    }
  })

  router.post('/resend', resendLimiter.middleware, async (req, res, next) => {
    try {
      const body = emailSchema.parse(req.body)
      const { rows } = await pool.query('SELECT * FROM auth_user_by_email($1)', [body.email])
      const row = rows[0]
      // Only re-issue for a real, existing, still-unverified account. Unknown
      // emails and already-verified accounts get the same benign 200 (no
      // enumeration).
      if (row && row.email_verified !== true && row.id) {
        await issueToken(pool, row.id, row.email, 'verify')
      }
      res.status(200).json({ sent: true })
    } catch (err) {
      next(err)
    }
  })

  // ---- password reset ------------------------------------------------------
  router.post('/reset-request', resetRequestLimiter.middleware, async (req, res, next) => {
    try {
      const body = emailSchema.parse(req.body)
      const { rows } = await pool.query('SELECT * FROM auth_user_by_email($1)', [body.email])
      const row = rows[0]
      // Always 200: unknown emails yield no token but the same response, so an
      // attacker cannot tell which addresses have accounts.
      if (row && row.password_hash != null && row.id) {
        await issueToken(pool, row.id, row.email, 'reset')
      }
      res.status(200).json({ sent: true })
    } catch (err) {
      next(err)
    }
  })

  router.post('/reset', async (req, res, next) => {
    try {
      const body = resetSchema.parse(req.body)
      const passwordHash = await hashPassword(body.password)
      const { rows } = await pool.query('SELECT * FROM auth_consume_reset($1, $2)', [
        sha256(body.token),
        passwordHash,
      ])
      if (!rows[0]?.auth_consume_reset) {
        res.status(400).json({ error: { code: 'invalid_token', message: 'Invalid or expired token' } })
        return
      }
      res.status(200).json({ reset: true })
    } catch (err) {
      next(err)
    }
  })

  router.post('/logout', requireAuth({ pool }), async (req, res, next) => {
    try {
      await destroySession(req.token, req.user.id, req.user.role, pool)
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  })

  router.get('/me', requireAuth({ pool }), async (req, res, next) => {
    try {
      const { rows } = await withUser(req.user.id, req.user.role, async (c) => {
        return c.query(
          'SELECT id, role, email, display_name, created_at, email_verified FROM users WHERE id = $1',
          [req.user.id],
        )
      }, pool)
      if (!rows.length) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } })
        return
      }
      res.status(200).json({ user: publicUser(rows[0]) })
    } catch (err) {
      next(err)
    }
  })

  return router
}
