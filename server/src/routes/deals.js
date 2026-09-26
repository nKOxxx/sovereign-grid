// server/src/routes/deals.js
// /api/deals — deal lifecycle, approvals, and the deal-room message thread.
//
//   POST /api/deals                operator only — create deal + parties
//   POST /api/deals/accept         buyer only — accept an ACTIVE listing and
//                                  open a deal themselves (idempotent, audited
//                                  by no INSERT trigger — see 0006)
//   GET  /api/deals                operator all; buyer/seller only deals they're
//                                  a party to (RLS deal_parties join enforces it)
//   GET  /api/deals/:id            party or operator, else 404
//   PATCH /api/deals/:id/status    operator only — status transition
//                                  (audit trigger writes audit_log)
//   POST /api/deals/:id/transitions  party owned — buyer/seller drive the
//                                  lifecycle through LEGAL_TRANSITIONS. A
//                                  transition to `contracted` ALSO writes a
//                                  real Transacted observation to
//                                  market_observations (0010) — the moat.
//   POST /api/deals/:id/approvals  operator only — record an approval decision
//                                  (audit trigger writes audit_log)
//   GET/POST /api/deals/:id/messages  parties + operator only
//
// Approvals & status changes land in the immutable audit_log via the existing
// 0001 triggers (trg_approvals_audit, trg_deals_status_audit); the new
// party transitions additionally write an explicit action='transition' row via
// the SECURITY DEFINER audit_log_transition() (0010) — needed because a party
// has no audit_log INSERT policy. RLS is the tenancy boundary throughout.

import { Router } from 'express'
import { z } from 'zod'
import { requireRole } from '../middleware/roles.js'
import { requireAuth } from '../middleware/auth.js'
import { requireVerified } from '../middleware/verified.js'
import { withUser } from '../db/pool.js'

const DEAL_STATUSES = [
  'negotiating', 'commercially_agreed', 'conditionally_awarded',
  'contracted', 'delivered', 'cancelled', 'completed',
]

// Party-driven lifecycle (POST /api/deals/:id/transitions). The value is the
// role that may make that move: 'buyer' | 'seller' | 'either'. Statuses absent
// as a key here (conditionally_awarded, cancelled, completed) are terminal for
// party moves — `completed` and `cancelled` have no outgoing edge, and a deal
// parked in `conditionally_awarded` (operator only) stays out of party hands.
// Exported for tests.
export const LEGAL_TRANSITIONS = {
  negotiating: { commercially_agreed: 'seller', cancelled: 'either' },
  commercially_agreed: { contracted: 'buyer', cancelled: 'either' },
  contracted: { delivered: 'seller' },
  delivered: { completed: 'buyer' },
}

const createDealSchema = z.object({
  name: z.string().trim().min(1).max(200),
  buyerId: z.string().uuid('valid buyerId required'),
  sellerId: z.string().uuid('valid sellerId required'),
  offerId: z.string().uuid().optional(),
})

const acceptSchema = z.object({
  listingId: z.string().uuid('valid listingId required'),
  requestId: z.string().uuid().optional(),
})

const statusSchema = z.object({
  status: z.enum(DEAL_STATUSES),
})

const transitionSchema = z.object({
  to: z.enum(DEAL_STATUSES),
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

  // ---- buyer accept (buyer only) -------------------------------------------
  // Buyers accept an ACTIVE listing themselves and open a deal (previously
  // operator-created only). offer_accept() (0006) is SECURITY DEFINER / owner-run
  // because a buyer cannot read the RLS-closed listings table (seller_id) or
  // write deals/deal_parties under default-deny RLS — the same precedent as
  // match_listings_for_match(). withUser supplies the buyer audit context. No
  // audit trigger fires on deal INSERT (0001 audits status UPDATEs + approvals
  // only) — noted rather than adding a migration.
  router.post('/accept', requireRole('buyer'), requireVerified(), async (req, res, next) => {
    try {
      const body = acceptSchema.parse(req.body)
      const { rows } = await withUser(req.user.id, 'buyer', async (c) => {
        return c.query('SELECT outcome, deal FROM offer_accept($1, $2, $3)', [
          req.user.id,
          body.listingId,
          body.requestId ?? null,
        ])
      }, pool)
      const { outcome, deal } = rows[0]
      if (outcome === 'not_found') {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      if (outcome === 'conflict') {
        res.status(409).json({ error: { code: 'conflict', message: 'Listing no longer available' } })
        return
      }
      // 'existing' -> idempotent replay returns the already-open deal with 200;
      // 'created' -> 201.
      res.status(outcome === 'existing' ? 200 : 201).json({ deal })
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

  // ---- party-driven transition (buyer/seller only, audited + observed) ------
  // Parties drive the lifecycle through LEGAL_TRANSITIONS. Operator keeps the
  // PATCH above. Permission = party of the deal AND the role for that edge
  // ('buyer' | 'seller' | 'either'). The deal + caller's party role are fetched
  // under the caller's RLS context (deals_party_select + deal_parties_self_select):
  // a non-party sees no join row and is rejected 403 regardless of existence
  // (participant listing already exists via GET /api/deals, so no 404-safety
  // burden). On success the status UPDATE and the explicit action='transition'
  // audit row commit together; a land on `contracted` ALSO writes the real
  // Transacted observation via deal_contract_observation() (0010) in the same
  // transaction — the moat. A dedupe conflict there is a silent no-op (ON
  // CONFLICT DO NOTHING); any other DB error propagates and rolls the whole
  // transition back (correct behavior — the observation must not outlive an
  // aborted move).
  router.post('/:id/transitions', requireRole(['buyer', 'seller']), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const { to } = transitionSchema.parse(req.body)
      const result = await withUser(req.user.id, req.user.role, async (c) => {
        const { rows } = await c.query(
          `SELECT d.id, d.status AS from_status, dp.role AS caller_role
           FROM deals d
           JOIN deal_parties dp ON dp.deal_id = d.id AND dp.user_id = $1
           WHERE d.id = $2`,
          [req.user.id, id],
        )
        const row = rows[0]
        if (!row) return { outcome: 'forbidden' } // not a party (or no such deal)

        const from = row.from_status
        const allowed = LEGAL_TRANSITIONS[from]
        const required = allowed && allowed[to]
        if (required === undefined) {
          return { outcome: 'invalid_transition', from, to }
        }
        if (required !== 'either' && required !== row.caller_role) {
          return { outcome: 'wrong_party', from, to, required }
        }

        const upd = await c.query('UPDATE deals SET status = $1 WHERE id = $2 RETURNING *', [to, id])
        await c.query('SELECT * FROM audit_log_transition($1, $2, $3, $4)', [req.user.id, id, from, to])

        // Moat: record the real transacted price the instant a deal is
        // contracted. Dedupe is handled silently by ON CONFLICT DO NOTHING in
        // the helper; if a unique-violation somehow still escapes we log and
        // swallow it (never block a transition), any other error rolls back.
        if (to === 'contracted') {
          try {
            await c.query('SELECT * FROM deal_contract_observation($1)', [id])
          } catch (err) {
            if (err && err.code === '23505') {
              console.warn(`transition: duplicate transacted observation for deal ${id} (swallowed)`)
            } else {
              throw err
            }
          }
        }
        return { outcome: 'ok', deal: upd.rows[0], from }
      }, pool)

      if (result.outcome === 'forbidden') {
        res.status(403).json({ error: { code: 'forbidden', message: 'Not a party to this deal' } })
        return
      }
      if (result.outcome === 'invalid_transition') {
        res.status(409).json({
          error: {
            code: 'invalid_transition',
            message: `Cannot transition deal from ${result.from} to ${result.to}`,
          },
        })
        return
      }
      if (result.outcome === 'wrong_party') {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: `Only the ${result.required === 'either' ? 'buyer or seller' : result.required} may move a deal from ${result.from} to ${result.to}`,
          },
        })
        return
      }
      res.status(200).json({ deal: result.deal, from: result.from })
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
