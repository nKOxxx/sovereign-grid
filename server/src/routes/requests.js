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
import { normalizeListing, normalizeRequest, quoteView } from '../domain/normalize.js'
import { computeCosts } from '../domain/calculator.js'
import { matchAll } from '../domain/score.js'

// JSONB fields map to Postgres `jsonb` columns. They MUST be objects, arrays
// or null — a bare scalar/string would otherwise pass zod (`z.unknown`) and 500
// deep inside pool.js.withUser with 'invalid input syntax for type json'. This
// union rejects scalars at the zod boundary so the client gets a clean 400 with
// the field path (WAVE E regression fix).
const jsonbField = () =>
  z.union([z.record(z.unknown()), z.array(z.unknown()), z.null()]).optional()

const requestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional(),
  accelerator_preferred: z.string().trim().max(200).optional(),
  accelerator_alternatives: z.array(z.string().trim().max(200)).optional(),
  count: z.coerce.number().int().positive().default(1),
  node: z.string().trim().max(200).optional(),
  workload_type: z.string().trim().max(200).optional(),
  workload: jsonbField(),
  location: jsonbField(),
  start_date: z.coerce.date().optional(),
  term_months: z.coerce.number().int().positive().optional(),
  firmness: z.string().trim().max(50).optional(),
  resilience: jsonbField(),
  compliance: jsonbField(),
  options: jsonbField(),
  budget: jsonbField(),
  privacy: jsonbField(),
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
      // node-pg serializes JS arrays as Postgres ARRAY literals (e.g. `{"spot"}`),
      // which a jsonb column rejects with 'invalid input syntax for type json'.
      // Explicitly JSON-encode every jsonb value (object/array) so pg stores it
      // as a json document; undefined/null stay NULL.
      const toJsonb = (v) => (v === undefined || v === null ? null : JSON.stringify(v))
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
        toJsonb(body.workload), toJsonb(body.location), body.start_date ?? null,
        body.term_months ?? null, body.firmness ?? null, toJsonb(body.resilience),
        toJsonb(body.compliance), toJsonb(body.options), toJsonb(body.budget),
        toJsonb(body.privacy), body.region ?? null,
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

  // ---- cleanup: operator-only request deletion (demo/test hygiene) ----
  // DELETE /api/requests/:id  (operator only)
  //   Deletes the request and every offer row that references it (the offers
  //   FK is ON DELETE SET NULL, so offers are purged explicitly here).
  //   Refuses with 409 when any referencing offer is already booked onto a
  //   deal — deal history is never destroyed by cleanup. Audit triggers stay
  //   live: audit_log rows written for this request are preserved by design.
  router.delete('/:id', requireRole('operator'), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)
      const out = await withUser(req.user.id, req.user.role, async (c) => {
        const exists = await c.query('SELECT 1 FROM requests WHERE id = $1', [id])
        if (!exists.rows.length) return { status: 404 }
        const booked = await c.query(
          'SELECT 1 FROM offers WHERE request_id = $1 AND deal_id IS NOT NULL LIMIT 1',
          [id],
        )
        if (booked.rows.length) return { status: 409 }
        await c.query('DELETE FROM offers WHERE request_id = $1', [id])
        const del = await c.query('DELETE FROM requests WHERE id = $1 RETURNING id', [id])
        return { status: 200, id: del.rows[0]?.id }
      }, pool)
      if (out.status === 404) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }
      if (out.status === 409) {
        res.status(409).json({
          error: {
            code: 'conflict',
            message: 'request has booked offers — deal history is not deletable',
          },
        })
        return
      }
      res.status(200).json({ deleted: out.id })
    } catch (err) {
      next(err)
    }
  })

  // ---- matches: normalize + score + filter + evidence-driven disqualify ----
  // GET /api/requests/:id/matches  (owner buyer or operator)
  //   Loads the request and every ACTIVE listing through the owner-run
  //   match_listings_for_match() read model (which carries committed_price +
  //   evidence + facility for scoring — quotes are shown to the matched buyer).
  //   Approved eligibility-case evidence for THIS request is merged in, so the
  //   evidence path can flip a disqualified listing to bookable. Then matchAll
  //   (verbatim port of src/lib/market.js) reproduces the demo's scores.
  router.get('/:id/matches', requireRole(['buyer', 'operator']), async (req, res, next) => {
    try {
      const { id } = paramsId.parse(req.params)

      const { request, listings } = await withUser(req.user.id, req.user.role, async (c) => {
        const reqRes = await c.query('SELECT * FROM requests WHERE id = $1', [id])
        if (!reqRes.rows.length) return { request: null, listings: [] }
        const listingRes = await c.query('SELECT * FROM match_listings_for_match()')
        return { request: reqRes.rows[0], listings: listingRes.rows.map((r) => r.listing) }
      }, pool)

      if (!request) {
        res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
        return
      }

      // Merge approved eligibility-case evidence for this request into the raw
      // listing payloads BEFORE normalization so the route gate can see it.
      // eligibility_cases is operator-internal (operator-only RLS); the
      // SECURITY DEFINER approved_eligibility_evidence() (0004) returns ONLY the
      // approved cases' {listing_id, evidence} for this request, so a buyer can
      // see the evidence that unlocked a route without ever touching the case's
      // status/missing/reason internals.
      if (listings.length) {
        const cases = await withUser(req.user.id, req.user.role, async (c) => {
          return c.query(
            'SELECT listing_id, evidence FROM approved_eligibility_evidence($1)',
            [id],
          )
        }, pool)
        const byListing = new Map()
        for (const row of cases.rows) {
          const arr = byListing.get(row.listing_id) || []
          arr.push(...(Array.isArray(row.evidence) ? row.evidence : []))
          byListing.set(row.listing_id, arr)
        }
        for (const raw of listings) {
          const extra = byListing.get(raw.id)
          if (extra && extra.length) {
            raw.evidence = [...(Array.isArray(raw.evidence) ? raw.evidence : []), ...extra]
          }
        }
      }

      const normalizedRequest = normalizeRequest(request)
      const normalizedListings = listings.map((raw) => normalizeListing(raw))
      const result = matchAll(normalizedListings, normalizedRequest)

      const toQuote = (listing) => quoteView(listing, normalizedRequest, computeCosts)

      const bookable = result.offers.map((o) => {
        const q = toQuote(o.listing)
        return {
          listingId: o.listing.id,
          name: o.listing.name,
          rank: o.rank,
          matchScore: o.score,
          committedPerAccelHr: q.committedPerAccelHr,
          effectivePerAccelHr: q.effectivePerAccelHr,
          totalContractValue: q.totalContractValue,
          monthlyRunRate: q.monthlyRunRate,
          commitmentValue: q.commitmentValue,
          breakEvenUtilization: q.breakEvenUtilization,
          componentScores: {
            performance: o.breakdown.workloadPerformance.score,
            sovereignty: o.breakdown.sovereignEligibility.score,
            powerResilience: o.breakdown.resilience.score,
          },
          scoreBreakdown: o.breakdown,
          explanation: o.explanation,
        }
      })

      const disqualified = result.policyHolds.map((o) => ({
        listingId: o.listing.id,
        name: o.listing.name,
        matchScore: o.score,
        disqualifyReason: o.disqualifyReason,
        componentScores: {
          performance: o.breakdown.workloadPerformance.score,
          sovereignty: o.breakdown.sovereignEligibility.score,
          powerResilience: o.breakdown.resilience.score,
        },
        scoreBreakdown: o.breakdown,
      }))

      res.status(200).json({
        request: { id: request.id, name: request.name },
        bookable,
        disqualified,
        excludedByHardFilters: result.excluded.length,
      })
    } catch (err) {
      next(err)
    }
  })

  return router
}
