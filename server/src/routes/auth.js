// server/src/routes/auth.js
// /api/auth — register, login, logout, me.
//
// Security notes:
//   * Passwords are hashed with scrypt BEFORE touching the DB (passwords.js) —
//     plaintext never reaches Postgres.
//   * Login is rate-limited (10/min/IP, in-memory) to blunt brute force.
//   * operator self-registration is rejected at the schema boundary
//     (auth_create_user RAISEs) AND at the route (zod enum excludes it) —
//     defense in depth. Operator accounts are provisioned via SQL by an admin.
//   * Wrong-password and unknown-email both yield a generic 401; we never
//     reveal whether the email exists.
//   * The user object returned to the client NEVER includes password_hash.
//   * All DB access inside a transaction passes through withUser() so RLS scopes
//     every row to the acting user (sessions self-context, /me self-row).

import { Router } from 'express'
import { z } from 'zod'
import { hashPassword, verifyPassword, PASSWORD_MIN_LENGTH } from '../auth/passwords.js'
import { createSession, destroySession } from '../auth/sessions.js'
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

function publicUser(row) {
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    displayName: row.display_name ?? null,
    createdAt: row.created_at,
  }
}

/**
 * @param {{pool: import('pg').Pool}} opts
 */
export function createAuthRouter({ pool }) {
  const router = Router()
  const loginLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 })

  router.post('/register', async (req, res, next) => {
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

      const { token } = await createSession(userId, body.role, pool)
      const { rows } = await withUser(userId, body.role, async (c) => {
        return c.query(
          'SELECT id, role, email, display_name, created_at FROM users WHERE id = $1',
          [userId],
        )
      }, pool)

      res.status(201).json({ token, user: publicUser(rows[0]) })
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
          'SELECT id, role, email, display_name, created_at FROM users WHERE id = $1',
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
