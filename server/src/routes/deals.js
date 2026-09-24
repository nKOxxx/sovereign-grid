// server/src/routes/deals.js
// /api/deals — deal lifecycle, approvals, and the deal-room message thread.
//
//   POST /api/deals                operator only — create deal + parties
//   GET  /api/deals                operator all; buyer/seller only deals they're
//                                  a party to (RLS deal_parties join enforces it)
//   GET  /api/deals/:id            party or operator, else 404
//   PATCH /api/deals/:id/status    operator only — status transition
//                                  (audit trigger writes audit_log)
//   POST /api/deals/:id/approvals  operator only — record an approval decision
//                                  (audit trigger writes audit_log)
//   GET/POST /api/deals/:id/messages  parties + operator only
//
// Approvals & status changes land in the immutable audit_log via the existing
// 0001 triggers (trg_approvals_audit, trg_deals_status_audit) — no app code
// writes audit rows directly. RLS is the tenancy boundary throughout.

import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../middleware/roles.js'
import { requireAuth } from '../middleware/auth.js'
import { withUser } from '../db/pool.js'

const DEAL_STATUSES = [
  'negotiating', 'commercially_agreed', 'conditionally_awarded',
  'contracted', 'delivered', 'cancelled', 'completed',
]

const createDealSchema = z.object({
  name: z.string().trim().min(1).max(200),
  buyerId: z.string().uuid('valid buyerId required'),
  sellerId: z.string().uuid('valid sellerId required'),
  offerId: z.string().uuid().optional(),
})

const statusSchema = z.object({
  status: z.enum(DEAL_STATUSES),
})

const approvalSchema = z.object({
  scope: z.string().trim().min(1).max(200),
  decision: z.enum(['approved', 'rejected', 'requested']),
  detail: z.string().trim().max(2000).optional(),
  expiresAt: z.coerce.date().optional(),
})

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
})

const paramsId = z.object({ id: z.string().uuid('invalid deal id') })

/** @param {{pool: import('pg').Pool}} opts */
export function createDealsRouter({ pool }) {
  const router = Router()
  router.use(requireAuth({ pool }))

  // ---- collection ---------------------------------------------------------
  router.post('/', requireRole('operator'), async (req, res, next) => {
    try {
      const body = createDealSchema.parse(req.body)
      const deal = await withUser(req.user.id, 'operator', async (c) => {
        const d = await c.query(
          'INSERT INTO deals (name, offer_id) VALUES ($1, $2) RETURNING *',
          [body.name, body.offerId ?? null],
        )
        await c.query(
          `INSERT INTO deal_parties (deal_id, user_id, role) VALUES ($1,$2,'buyer'),($1,$3,'seller'),($1,$4,'operator')`,
          [d.rows[0].id, body.buyerId, body.sellerId, req.user.id],
        )
        return d.rows[0]
      }, pool)
      res.status(201).json({ deal })
    } catch (err) {
      next(err)
    }
  })

  router.get('/', requireRole(['operator', 'buyer', 'seller']), async (req, res, next) => {
    try {
      const { rows } = await withUser(req.user.id, req.user.role, async (c) => {
        // RLS: operator sees all; buyer/seller see only deals with a deal_parties
        // row for them (deals_party_select).
        return c.query('SELECT * FROM deals ORDER BY created_at DESC')
      }, pool)
      res.status(200).json({ deals: rows })
    } catch (err) {
      next(err)
    }
  })

  router.get('/:id', requireRole(['operator', 'buyer', 'seller']), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const { rows } = await withUser(req.user.id, req.user.role, async (c) => {
        return c.query('SELECT * FROM deals WHERE id = $1', [id])
      }, pool)
      if (!rows.length) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      res.status(200).json({ deal: rows[0] })
    } catch (err) {
      next(err)
    }
  })

  // ---- status transition (operator only, audited) --------------------------
  router.patch('/:id/status', requireRole('operator'), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const { status } = statusSchema.parse(req.body)
      const { rows } = await withUser(req.user.id, 'operator', async (c) => {
        return c.query(
          'UPDATE deals SET status = $1 WHERE id = $2 RETURNING *',
          [status, id],
        )
      }, pool)
      if (!rows.length) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      res.status(200).json({ deal: rows[0] })
    } catch (err) {
      next(err)
    }
  })

  // ---- approvals (operator only, audited) ----------------------------------
  const approvals = Router({ mergeParams: true })
  approvals.post('/', requireRole('operator'), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const body = approvalSchema.parse(req.body)
      const { rows } = await withUser(req.user.id, 'operator', async (c) => {
        const exists = await c.query('SELECT 1 FROM deals WHERE id = $1', [id])
        if (!exists.rows.length) return { rows: [] }
        const r = await c.query(
          `INSERT INTO approvals (deal_id, approver_id, scope, decision, detail, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [id, req.user.id, body.scope, body.decision, body.detail ?? null, body.expiresAt ?? null],
        )
        return r
      }, pool)
      if (!rows.length) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      res.status(201).json({ approval: rows[0] })
    } catch (err) {
      next(err)
    }
  })
  router.use('/:id/approvals', approvals)

  // ---- deal-room messages (parties + operator only) ------------------------
  const messages = Router({ mergeParams: true })
  messages.get('/', requireRole(['operator', 'buyer', 'seller']), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const { rows } = await withUser(req.user.id, req.user.role, async (c) => {
        // RLS scopes to party/operator; a non-party sees none.
        return c.query(
          'SELECT * FROM messages WHERE deal_id = $1 ORDER BY sent_at ASC',
          [id],
        )
      }, pool)
      res.status(200).json({ messages: rows })
    } catch (err) {
      next(err)
    }
  })

  messages.post('/', requireRole(['operator', 'buyer', 'seller']), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const body = messageSchema.parse(req.body)
      const { rows } = await withUser(req.user.id, req.user.role, async (c) => {
        const exists = await c.query('SELECT 1 FROM deals WHERE id = $1', [id])
        if (!exists.rows.length) return { rows: [] }
        // messages_party_all / operator_all WITH CHECK rejects non-parties.
        return c.query(
          `INSERT INTO messages (deal_id, author_id, from_role, body)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [id, req.user.id, req.user.role, body.body],
        )
      }, pool)
      if (!rows.length) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      res.status(201).json({ message: rows[0] })
    } catch (err) {
      next(err)
    }
  })
  router.use('/:id/messages', messages)

  return router
}
