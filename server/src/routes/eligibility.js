// server/src/routes/eligibility.js
// /api/eligibility/cases — evidence-driven, per-(listing, request) eligibility.
//
//   POST /api/eligibility/cases          (operator / system) — open a case for a
//                                         listing + request; compute the route
//                                         gate outcome + missing evidence.
//   PATCH /api/eligibility/cases/:id/evidence (operator) — append evidence
//                                         (e.g. euCompliantProcessing,
//                                         zeroDataRetention) to the case.
//   POST /api/eligibility/cases/:id/approve (operator) — require the case's
//                                         evidence to satisfy the request's
//                                         requirements, then set status approved
//                                         -> the listing becomes bookable for
//                                         that request.
//   POST /api/eligibility/cases/:id/reject (operator) — mark rejected.
//
// Every mutation lands in the immutable audit_log via the eligibility_cases
// audit trigger (0003). RLS: operator-only (eligibility cases are an internal
// workflow; buyers/sellers interact with them through /matches).

import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { withUser } from '../db/pool.js'
import { normalizeListing, normalizeRequest } from '../domain/normalize.js'
import { evaluateEligibility, requiredEvidenceFor } from '../domain/eligibility.js'

const createCaseSchema = z.object({
  listingId: z.string().uuid('valid listingId required'),
  requestId: z.string().uuid('valid requestId required'),
})

const paramsId = z.object({ id: z.string().uuid('invalid case id') })

const evidenceSchema = z.object({
  type: z.string().trim().min(1).max(100),
  issuer: z.string().trim().max(200).optional(),
  issuedAt: z.string().trim().max(40).optional(),
})

/** Load the raw listing jsonb (active listings only, via the match read model). */
async function loadListingRaw(pool, c, listingId) {
  const { rows } = await c.query(
    `SELECT listing FROM match_listings_for_match() WHERE listing->>'id' = $1`,
    [listingId],
  )
  return rows.length ? rows[0].listing : null
}

/** Evaluate a case's listing + (listing + case) evidence against its request. */
async function evaluateCase(pool, c, caseRow) {
  const raw = await loadListingRaw(pool, c, caseRow.listing_id)
  const reqRes = await c.query('SELECT * FROM requests WHERE id = $1', [caseRow.request_id])
  if (!raw || !reqRes.rows.length) return null

  const listing = normalizeListing(raw)
  const request = normalizeRequest(reqRes.rows[0])

  // Merge this case's evidence into the base listing evidence before evaluating.
  if (Array.isArray(caseRow.evidence) && caseRow.evidence.length) {
    listing.evidence = [...(listing.evidence || []), ...caseRow.evidence]
  }
  const gate = evaluateEligibility(listing, request)
  const required = requiredEvidenceFor(request)
  const have = new Set((listing.evidence || []).map((e) => e.type))
  const stillMissing = required.filter((r) => !have.has(r.type))
  return { listing, request, gate, required, stillMissing }
}

/** @param {{pool: import('pg').Pool}} opts */
export function createEligibilityRouter({ pool }) {
  const router = Router()
  router.use(requireAuth({ pool }))
  router.use(requireRole('operator'))

  router.post('/cases', async (req, res, next) => {
    try {
      const body = createCaseSchema.parse(req.body)
      const created = await withUser(req.user.id, 'operator', async (c) => {
        const listingExists = await c.query('SELECT 1 FROM listings WHERE id = $1', [body.listingId])
        const requestExists = await c.query('SELECT 1 FROM requests WHERE id = $1', [body.requestId])
        if (!listingExists.rows.length || !requestExists.rows.length) return { rows: [] }

        const raw = await loadListingRaw(pool, c, body.listingId)
        const reqRes = await c.query('SELECT * FROM requests WHERE id = $1', [body.requestId])
        const listing = normalizeListing(raw)
        const request = normalizeRequest(reqRes.rows[0])
        const gate = evaluateEligibility(listing, request)
        const required = requiredEvidenceFor(request)
        const missing = gate.pass ? [] : gate.missing

        return c.query(
          `INSERT INTO eligibility_cases (listing_id, request_id, status, reason, missing, created_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [body.listingId, body.requestId, gate.pass ? 'open' : 'conditional', gate.reason, JSON.stringify(missing), req.user.id],
        )
      }, pool)
      if (!created.rows.length) {
        res.status(404).json({ error: { code: 'not_found', message: 'Listing or request not found' } })
        return
      }
      res.status(201).json({ case: created.rows[0] })
    } catch (err) {
      next(err)
    }
  })

  router.patch('/cases/:id/evidence', async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const body = evidenceSchema.parse(req.body)
      const entry = { type: body.type, issuer: body.issuer || null, status: 'reviewed', issued_at: body.issuedAt || null }

      const { rows } = await withUser(req.user.id, 'operator', async (c) => {
        const cur = await c.query('SELECT * FROM eligibility_cases WHERE id = $1', [id])
        if (!cur.rows.length) return { rows: [] }
        const evidence = [...(Array.isArray(cur.rows[0].evidence) ? cur.rows[0].evidence : []), entry]
        return c.query(
          `UPDATE eligibility_cases SET evidence = $2, status = 'conditional' WHERE id = $1 RETURNING *`,
          [id, JSON.stringify(evidence)],
        )
      }, pool)
      if (!rows.length) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      res.status(200).json({ case: rows[0] })
    } catch (err) {
      next(err)
    }
  })

  router.post('/cases/:id/approve', async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const result = await withUser(req.user.id, 'operator', async (c) => {
        const cur = await c.query('SELECT * FROM eligibility_cases WHERE id = $1', [id])
        if (!cur.rows.length) return { status: 'not_found' }
        const ev = await evaluateCase(pool, c, cur.rows[0])
        if (!ev) return { status: 'conflict', missing: [] }
        if (ev.stillMissing.length > 0) return { status: 'missing', missing: ev.stillMissing }
        const done = await c.query(
          `UPDATE eligibility_cases
           SET status = 'approved', approved_by = $2, decided_at = now()
           WHERE id = $1 RETURNING *`,
          [id, req.user.id],
        )
        return { status: 'ok', case: done.rows[0] }
      }, pool)

      if (result.status === 'not_found') {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      if (result.status === 'missing') {
        res.status(409).json({
          error: {
            code: 'evidence_pending',
            message: 'Case still missing required evidence; cannot approve yet.',
          },
          missing: result.missing.map((m) => m.type),
        })
        return
      }
      if (result.status === 'conflict') {
        res.status(409).json({ error: { code: 'not_approvable', message: 'Listing or request not resolvable.' } })
        return
      }
      res.status(200).json({ case: result.case })
    } catch (err) {
      next(err)
    }
  })

  router.post('/cases/:id/reject', async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const { rows } = await withUser(req.user.id, 'operator', async (c) => {
        const cur = await c.query('SELECT * FROM eligibility_cases WHERE id = $1', [id])
        if (!cur.rows.length) return { rows: [] }
        return c.query(
          `UPDATE eligibility_cases SET status = 'rejected', approved_by = $2, decided_at = now()
           WHERE id = $1 RETURNING *`,
          [id, req.user.id],
        )
      }, pool)
      if (!rows.length) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      res.status(200).json({ case: rows[0] })
    } catch (err) {
      next(err)
    }
  })

  return router
}
