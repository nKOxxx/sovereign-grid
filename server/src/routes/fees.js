// server/src/routes/fees.js
// /api/fees/policy — platform fee policy.
//
//   GET /api/fees/policy   any authenticated user — read current policy
//                          (selected/operator-editable; defaults to demo 8%).
//   PUT /api/fees/policy   operator only — persist a new policy; writes an
//                          audit_log row (fee_policy audit trigger).
//
// The stored row is merged over the demo default (resolveFeePolicy) so the
// policy is never null and unknown back-keys fall back gracefully.

import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { withUser } from '../db/pool.js'
import { DEFAULT_FEE_POLICY, resolveFeePolicy } from '../domain/fees.js'

const POLICY_KEY = 'platform'

const feePolicySchema = z.object({
  platformFee: z.number().min(0).max(1),
  feeBasis: z.enum(['pct', 'perHr']).optional(),
  feePayer: z.enum(['buyer', 'seller', 'split']).optional(),
  splitPct: z.number().min(0).max(100).optional(),
  partnerSplitPct: z.number().min(0).max(100).optional(),
  minMarginPct: z.number().min(0).max(100).optional(),
})

/** @param {{pool: import('pg').Pool}} opts */
export function createFeesRouter({ pool }) {
  const router = Router()
  router.use(requireAuth({ pool }))
  router.use(requireRole('any'))

  router.get('/policy', async (req, res, next) => {
    try {
      // NOTE (Wave F): wrap the read in withUser so the RLS user context is set.
      // fee_policy has row-level security keyed on app.user_role; a bare pool
      // query hides the stored row and returns the default even after a PUT.
      const { rows } = await withUser(req.user.id, req.user.role, async (c) => {
        return c.query('SELECT value FROM fee_policy WHERE key = $1', [POLICY_KEY])
      })
      const stored = rows.length ? rows[0].value : {}
      res.status(200).json({ policy: resolveFeePolicy(stored) })
    } catch (err) {
      next(err)
    }
  })

  router.put('/policy', requireRole('operator'), async (req, res, next) => {
    try {
      const body = feePolicySchema.parse(req.body)
      // Merge over the existing stored policy so partial PUTs don't drop keys.
      const { rows } = await pool.query('SELECT value FROM fee_policy WHERE key = $1', [POLICY_KEY])
      const merged = { ...(rows.length ? rows[0].value : DEFAULT_FEE_POLICY), ...body }

      const { rows: written } = await withUser(req.user.id, 'operator', async (c) => {
        return c.query(
          `INSERT INTO fee_policy (key, value, updated_by, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()
           RETURNING value`,
          [POLICY_KEY, JSON.stringify(merged), req.user.id],
        )
      }, pool)

      res.status(200).json({ policy: resolveFeePolicy(written[0].value) })
    } catch (err) {
      next(err)
    }
  })

  return router
}
