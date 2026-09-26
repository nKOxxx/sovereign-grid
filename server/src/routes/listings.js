// server/src/routes/listings.js
// /api/listings — seller capacity listings + the public marketplace.
//
//   POST /api/listings                seller only  — create (seller_id = self;
//                                     ALWAYS status='pending' — any client-
//                                     supplied status is stripped; an operator
//                                     must approve before it reaches the pool)
//   GET  /api/listings                seller own / operator all
//   GET  /api/listings?status=pending OPERATOR ONLY — review queue (seller/buyer 403)
//   PATCH /api/listings/:id/status    operator only — approve('active') / reject('rejected')
//   GET  /api/listings/marketplace    PUBLIC — anonymized marketplace read model
//
// Marketplace safety: served for anonymous clients via the security-definer
// owned VIEW v_marketplace_listings (see 0002_auth.sql). The view exposes ONLY
// the explicit safe/anonymized column whitelist — it contains NO seller_id and
// NO committed_price, so neither seller identity nor negotiated pricing ever
// leaves the API. The base `listings` table remains RLS-protected.

import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../middleware/roles.js'
import { requireAuth } from '../middleware/auth.js'
import { requireVerified } from '../middleware/verified.js'
import { withUser } from '../db/pool.js'

const listingSchema = z.object({
  name: z.string().trim().min(1).max(200),
  provider_type: z.string().trim().min(1).max(200),
  gpu_model: z.string().trim().min(1).max(200),
  region: z.enum(['GCC', 'EU']),
  count: z.coerce.number().int().positive().default(1),
  node: z.string().trim().max(200).optional(),
  interconnect: z.string().trim().max(200).optional(),
  memory: z.string().trim().max(200).optional(),
  software: z.unknown().optional(),
  portability: z.unknown().optional(),
  facility: z.unknown().optional(),
  data_residency: z.string().trim().max(200).optional(),
  firmness: z.string().trim().max(50).optional(),
  start_date: z.coerce.date().optional(),
  min_term_months: z.coerce.number().int().positive().optional(),
  max_term_months: z.coerce.number().int().positive().optional(),
  committed_price: z.number().nonnegative().optional(),
  on_demand_price: z.number().nonnegative().optional(),
  currency: z.string().trim().max(10).default('USD'),
  billing_unit: z.string().trim().max(50).optional(),
  commercial: z.unknown().optional(),
  commitment: z.unknown().optional(),
  resilience: z.unknown().optional(),
  sovereign: z.unknown().optional(),
  power: z.unknown().optional(),
  verification_status: z.string().trim().max(50).optional(),
  evidence_confidence: z.coerce.number().int().min(0).max(100).optional(),
})

// Listing status is NOT client-controllable on POST: zod strips any supplied
// status and the route hardcodes 'pending' so an unreviewed listing can never
// self-activate. Approve/reject is operator-only via PATCH /:id/status.
const listingStatusSchema = z.object({
  status: z.enum(['active', 'rejected']),
})

const paramsId = z.object({ id: z.string().uuid('invalid listing id') })

/**
 * @param {{pool: import('pg').Pool}} opts
 */
export function createListingsRouter({ pool }) {
  const router = Router()

  // Public marketplace — intentionally NOT behind requireAuth.
  router.get('/marketplace', async (_req, res, next) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM v_marketplace_listings ORDER BY created_at DESC',
      )
      res.status(200).json({ listings: rows })
    } catch (err) {
      next(err)
    }
  })

  // Everything below requires authentication.
  router.use(requireAuth({ pool }))

  // Creating a listing is a gated (verified-seller) action.
  router.post('/', requireRole('seller'), requireVerified(), async (req, res, next) => {
    try {
      const body = listingSchema.parse(req.body)
      const columns = [
        'seller_id', 'name', 'provider_type', 'gpu_model', 'region', 'count',
        'node', 'interconnect', 'memory', 'software', 'portability', 'facility',
        'data_residency', 'firmness', 'start_date', 'min_term_months',
        'max_term_months', 'committed_price', 'on_demand_price', 'currency',
        'billing_unit', 'commercial', 'commitment', 'resilience', 'sovereign',
        'power', 'verification_status', 'evidence_confidence', 'status',
      ]
      const values = [
        req.user.id, body.name, body.provider_type, body.gpu_model, body.region,
        body.count, body.node ?? null, body.interconnect ?? null,
        body.memory ?? null, body.software ?? null, body.portability ?? null,
        body.facility ?? null, body.data_residency ?? null, body.firmness ?? null,
        body.start_date ?? null, body.min_term_months ?? null,
        body.max_term_months ?? null, body.committed_price ?? null,
        body.on_demand_price ?? null, body.currency, body.billing_unit ?? null,
        body.commercial ?? null, body.commitment ?? null, body.resilience ?? null,
        body.sovereign ?? null, body.power ?? null,
        body.verification_status ?? null, body.evidence_confidence ?? null,
        'pending', // review gate: new listings never self-activate
      ]
      const { rows } = await withUser(req.user.id, 'seller', async (c) => {
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
        return c.query(
          `INSERT INTO listings (${columns.join(', ')})
           VALUES (${placeholders}) RETURNING *`,
          values,
        )
      }, pool)
      res.status(201).json({ listing: rows[0] })
    } catch (err) {
      next(err)
    }
  })

  router.get('/', requireRole(['seller', 'operator']), async (req, res, next) => {
    try {
      // The pending review queue is operator-only. requireRole above already
      // 403s buyers; we additionally 403 a seller who probes ?status=pending.
      // Only one queue filter exists today — 'pending' — which the operator
      // console renders. Values are compared against a fixed literal (never
      // interpolated), so no SQL injection surface.
      const isPendingQueue = req.query.status === 'pending'
      if (isPendingQueue && req.user.role !== 'operator') {
        res.status(403).json({ error: { code: 'forbidden', message: 'Insufficient role' } })
        return
      }
      const { rows } = await withUser(req.user.id, req.user.role, async (c) => {
        if (isPendingQueue) {
          return c.query(
            'SELECT * FROM listings WHERE status = $1 ORDER BY created_at DESC',
            ['pending'],
          )
        }
        // Plain GET: RLS scopes a seller to their own rows (incl. their
        // pending listings — their own data); operator sees all. The PUBLIC
        // surface is /api/listings/marketplace, which is active-only via the
        // v_marketplace_listings view, and the matching pool is active-only via
        // match_listings_for_match() — neither leaks pending rows.
        return c.query('SELECT * FROM listings ORDER BY created_at DESC')
      }, pool)
      res.status(200).json({ listings: rows })
    } catch (err) {
      next(err)
    }
  })

  // ---- review gate: operator approve / reject ------------------------------
  router.patch('/:id/status', requireRole('operator'), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const { status } = listingStatusSchema.parse(req.body)
      const { rows } = await withUser(req.user.id, 'operator', async (c) => {
        return c.query(
          'UPDATE listings SET status = $1 WHERE id = $2 RETURNING *',
          [status, id],
        )
      }, pool)
      if (!rows.length) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      res.status(200).json({ listing: rows[0] })
    } catch (err) {
      next(err)
    }
  })

  return router
}
