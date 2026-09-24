// server/src/routes/requests.js
// /api/requests — buyer demand requests.
//
//   POST /api/requests        buyer only  — create a request (buyer_id = self)
//   GET  /api/requests        buyer own / operator all
//   GET  /api/requests/:id    owner or operator, else 404
//
// All writes go through withUser(self.id, self.role, ...) so RLS pins the
// row to the caller's tenant. Anything the caller is not entitled to read is
// invisible (RLS), which surfaces as 404 here — an attacker cannot probe
// whether a foreign id merely doesn't exist.

import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../middleware/roles.js'
import { requireAuth } from '../middleware/auth.js'
import { withUser } from '../db/pool.js'

const requestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional(),
  accelerator_preferred: z.string().trim().max(200).optional(),
  accelerator_alternatives: z.array(z.string().trim().max(200)).optional(),
  count: z.coerce.number().int().positive().default(1),
  node: z.string().trim().max(200).optional(),
  workload_type: z.string().trim().max(200).optional(),
  workload: z.unknown().optional(),
  location: z.unknown().optional(),
  start_date: z.coerce.date().optional(),
  term_months: z.coerce.number().int().positive().optional(),
  firmness: z.string().trim().max(50).optional(),
  resilience: z.unknown().optional(),
  compliance: z.unknown().optional(),
  options: z.unknown().optional(),
  budget: z.unknown().optional(),
  privacy: z.unknown().optional(),
  region: z.string().trim().max(100).optional(),
})

const paramsId = z.object({ id: z.string().uuid('invalid request id') })

/**
 * @param {{pool: import('pg').Pool}} opts
 */
export function createRequestsRouter({ pool }) {
  const router = Router()
  router.use(requireAuth({ pool }))

  router.post('/', requireRole('buyer'), async (req, res, next) => {
    try {
      const body = requestSchema.parse(req.body)
      const columns = [
        'buyer_id', 'name', 'company', 'accelerator_preferred', 'accelerator_alternatives',
        'count', 'node', 'workload_type', 'workload', 'location', 'start_date',
        'term_months', 'firmness', 'resilience', 'compliance', 'options',
        'budget', 'privacy', 'region',
      ]
      const values = [
        req.user.id, body.name, body.company ?? null,
        body.accelerator_preferred ?? null, body.accelerator_alternatives ?? null,
        body.count, body.node ?? null, body.workload_type ?? null,
        body.workload ?? null, body.location ?? null, body.start_date ?? null,
        body.term_months ?? null, body.firmness ?? null, body.resilience ?? null,
        body.compliance ?? null, body.options ?? null, body.budget ?? null,
        body.privacy ?? null, body.region ?? null,
      ]
      const { rows } = await withUser(req.user.id, 'buyer', async (c) => {
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
        return c.query(
          `INSERT INTO requests (${columns.join(', ')})
           VALUES (${placeholders}) RETURNING *`,
          values,
        )
      }, pool)
      res.status(201).json({ request: rows[0] })
    } catch (err) {
      next(err)
    }
  })

  router.get('/', requireRole(['buyer', 'operator']), async (req, res, next) => {
    try {
      const { rows } = await withUser(req.user.id, req.user.role, async (c) => {
        // RLS scopes: buyer sees own rows only; operator sees all.
        return c.query('SELECT * FROM requests ORDER BY created_at DESC')
      }, pool)
      res.status(200).json({ requests: rows })
    } catch (err) {
      next(err)
    }
  })

  router.get('/:id', requireRole(['buyer', 'operator']), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const { rows } = await withUser(req.user.id, req.user.role, async (c) => {
        return c.query('SELECT * FROM requests WHERE id = $1', [id])
      }, pool)
      if (!rows.length) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      res.status(200).json({ request: rows[0] })
    } catch (err) {
      next(err)
    }
  })

  return router
}
