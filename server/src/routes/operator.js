// server/src/routes/operator.js
// /api/operator — operator-only account-trust tooling (Wave M).
//
// Email-verification / password-reset hand-off. No SMTP is configured, so a
// human operator completes delivery of one-time tokens until real email lands:
//
//   GET  /api/operator/verifications
//        -> pending one-time tokens (purpose verify|reset): [{ id, email,
//           purpose, createdAt, expiresAt }]. NEVER includes the token.
//   POST /api/operator/verifications/:id/reveal
//        -> { token } for a pending verification. Returns the raw one-time
//           token ONCE (a repeat reveal -> 410 Gone) and writes an immutable
//           audit_log row via the SECURITY DEFINER auth_log_reveal(). The
//           operator then hands the token to the caller out-of-band.
//
// Whole router is behind requireAuth + requireRole('operator'), so only
// admins/provisioned operators (who never go through /api/auth/register) can
// reach it. See 0009_auth_trust.sql header + verification.js TODO(M) for the
// SMTP replacement plan.

import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { withUser } from '../db/pool.js'

const paramsId = z.object({ id: z.string().uuid('invalid verification id') })

/** @param {{pool: import('pg').Pool}} opts */
export function createOperatorRouter({ pool }) {
  const router = Router()
  router.use(requireAuth({ pool }))
  router.use(requireRole('operator'))

  // Pending (unused, unexpired) one-time tokens — id/email/createdAt only, no token.
  router.get('/verifications', async (req, res, next) => {
    try {
      const { rows } = await withUser(req.user.id, 'operator', async (c) => {
        return c.query(
          `SELECT v.id, u.email, v.purpose, v.created_at, v.expires_at
           FROM email_verifications v
           JOIN users u ON u.id = v.user_id
           WHERE v.used_at IS NULL AND v.expires_at > now()
           ORDER BY v.created_at`,
        )
      }, pool)
      res.status(200).json({
        verifications: rows.map((r) => ({
          id: r.id,
          email: r.email,
          purpose: r.purpose,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
        })),
      })
    } catch (err) {
      next(err)
    }
  })

  // Reveal a pending token exactly once (audited).
  router.post('/verifications/:id/reveal', async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const result = await withUser(req.user.id, 'operator', async (c) => {
        const { rows } = await c.query('SELECT * FROM email_verifications WHERE id = $1', [id])
        const v = rows[0]
        if (!v || v.used_at != null) return { status: 'not_found' }
        if (v.revealed_at != null) return { status: 'already_revealed' }
        await c.query('UPDATE email_verifications SET revealed_at = now() WHERE id = $1', [id])
        await c.query('SELECT * FROM auth_log_reveal($1, $2)', [id, req.user.id])
        return { status: 'ok', token: v.token_raw }
      }, pool)

      if (result.status === 'not_found') {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      if (result.status === 'already_revealed') {
        res.status(410).json({ error: { code: 'gone', message: 'Token was already revealed' } })
        return
      }
      res.status(200).json({ token: result.token })
    } catch (err) {
      next(err)
    }
  })

  return router
}
