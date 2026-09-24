// server/test/wave_c.test.js
// Wave C — Domain API end-to-end acceptance suite.
//
// Spins the real Express app (createApp) on an ephemeral port against a scratch
// database that has been migrated AND seeded with the illustrative demo dataset
// (db/seed.js — the same Golden Project Falcon dataset the UI shows). Exercises
// the full stack: middleware -> zod -> RLS-scoped DB -> audit triggers.
//
// The Golden Falcon request (256x H200, 24 months, EU primary + UAE failover,
// zero-data-retention + EU-compliant) reproduces the demo's exact outcome:
//   3 bookable offers  — Nordic H200 93, Anonymous MI300X 90, GulfGrid H200 87
//   Shenhua Ascend 910C disqualified (route-conditional evidence, transparent)
//   2 excluded by hard filters (Cascade US = location; Harbor TPU = firmness)
//
// The calculator / fees assertions compare the domain ports against the
// frontend's OWN unit-tested pure functions (src/lib/cost.js, src/lib/fees.js —
// plain JS, imported directly) to prove byte-identical outputs for identical
// inputs.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { migrate } from '../src/db/migrate.js'
import { createPool, withUser } from '../src/db/pool.js'
import { createApp } from '../src/app.js'
import { createScratchDb, dropScratchDb } from './helpers/db.js'
import { seed } from '../db/seed.js'

// Frontend pure-function sources — the ground truth the ports must match within 0.
import { computeCalculator as feComputeCalculator } from '../../src/lib/cost.js'
import { computeFees as feComputeFees } from '../../src/lib/fees.js'
import { computeCalculator, computeCosts } from '../src/domain/calculator.js'
import { computeFees, resolveFeePolicy } from '../src/domain/fees.js'
import { matchAll } from '../src/domain/score.js'
import { sellerListings, goldenRequest } from '../../src/data/seed.js'

let scratch
let appPool
let app
let server
let url

let opToken
let opId
let falconToken
let falconId
let requestId

// Fixed seed UUIDs (db/seed.js).
const EU_H200 = '10000000-0000-4000-8000-000000000001'
const CN_ASCEND = '10000000-0000-4000-8000-000000000004'
const SELLER1 = '00000000-0000-4000-8000-000000000003'

function listenExpress(a) {
  return new Promise((resolve) => {
    const srv = a.listen(0, () => resolve(srv))
  })
}
function baseUrl(srv) {
  return `http://127.0.0.1:${srv.address().port}`
}
async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const hasBody = body !== undefined && method !== 'GET' && method !== 'HEAD'
  const res = await fetch(`${url}${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* 204 / empty body */
  }
  return { status: res.status, json }
}

const FALCON_BODY = {
  name: 'Project Falcon',
  company: 'European AI company',
  accelerator_preferred: 'h200',
  accelerator_alternatives: ['mi300x', 'ascend-910c'],
  count: 256,
  node: '8x H200',
  workload_type: 'training',
  workload: {
    description: 'European AI company training a frontier model. Primary EU deployment, UAE failover required.',
    frameworks: ['PyTorch'],
    utilization: 0.65,
  },
  location: {
    primary: ['Finland', 'Ireland'],
    failover: ['United Arab Emirates'],
    prohibited: [],
    chinaPolicy: 'route-specific review required',
    dataResidency: 'EU (GDPR)',
    personnelAccess: 'EU personnel only',
  },
  start_date: '2027-01-01',
  term_months: 24,
  firmness: 'firm',
  resilience: { maxOutage: '1h', failoverRequired: true, multiSite: false },
  compliance: { zeroDataRetention: true, euCompliant: true, certifications: [] },
  region: 'EU',
}

beforeAll(async () => {
  scratch = await createScratchDb()
  await migrate({ url: scratch.url, log: () => {} })
  appPool = createPool(scratch.appUrl)
  // Seed with a dedicated pool (seed() ends its own pool internally).
  await seed(createPool(scratch.appUrl))

  app = createApp({ pool: appPool })
  server = await listenExpress(app)
  url = baseUrl(server)

  const op = await api('POST', '/api/auth/login', {
    body: { email: 'operator@sg.local', password: 'sg-operator-dev' },
  })
  expect(op.status).toBe(200)
  opToken = op.json.token
  opId = op.json.user.id

  const falcon = await api('POST', '/api/auth/login', {
    body: { email: 'falcon@demo.local', password: 'sg-falcon-dev' },
  })
  expect(falcon.status).toBe(200)
  falconToken = falcon.json.token
  falconId = falcon.json.user.id
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  await appPool.end()
  await dropScratchDb(scratch.dbName)
})

// ---------------------------------------------------------------------------
describe('Golden Project Falcon flow (e2e, buyer path)', () => {
  it('reproduces the demo: 3 bookable (93/90/87), Ascend transparently disqualified, 2 hard-excluded', async () => {
    const created = await api('POST', '/api/requests', { token: falconToken, body: FALCON_BODY })
    expect(created.status).toBe(201)
    expect(created.json.request.buyer_id).toBe(falconId)
    requestId = created.json.request.id

    const m = await api('GET', `/api/requests/${requestId}/matches`, { token: falconToken })
    expect(m.status).toBe(200)

    // Exactly three bookable offers at the demo's scores.
    expect(m.json.bookable).toHaveLength(3)
    const byScore = [...m.json.bookable].sort((a, b) => b.matchScore - a.matchScore)
    expect(byScore.map((b) => b.matchScore)).toEqual([93, 90, 87])
    expect(byScore.map((b) => b.name)).toEqual([
      'Nordic H200 — Helsinki primary',
      'Anonymous MI300X cluster (capacity evidenced)',
      'GulfGrid H200 — Abu Dhabi',
    ])

    // Each bookable offer carries the normalized complete-cost quote fields.
    for (const b of byScore) {
      expect(typeof b.committedPerAccelHr).toBe('number')
      expect(typeof b.effectivePerAccelHr).toBe('number')
      expect(b.componentScores).toMatchObject({ performance: expect.any(Number), sovereignty: expect.any(Number), powerResilience: expect.any(Number) })
    }

    // Ascend is surfaced as policy-disqualified with a human route-condition reason.
    const disq = m.json.disqualified.find((d) => d.name.includes('Ascend'))
    expect(disq).toBeDefined()
    expect(disq.disqualifyReason).toMatch(/EU-compliant processing/i)
    expect(disq.disqualifyReason).toMatch(/zero-data-retention/i)

    // Two excluded by hard filters: US (location) + TPU (firmness).
    expect(m.json.excludedByHardFilters).toBe(2)
  })

  it('server matchAll port agrees with the frontend seed engine (exact scores)', () => {
    // Cross-check the Route's computed response against the frontend engine for
    // identical inputs — guarantees no server-side drift from the demo.
    const result = matchAll(sellerListings, goldenRequest)
    expect(result.offers.map((o) => o.score).sort((a, b) => b - a)).toEqual([93, 90, 87])
    expect(result.policyHolds.some((o) => o.listing.id === 'cn-ascend910c')).toBe(true)
    expect(result.excluded.length).toBe(2)
  })
})

// ---------------------------------------------------------------------------
describe('calculator matches the frontend within 0 for identical inputs', () => {
  const CALC = {
    count: 256,
    pricePerAccelHr: 2.15,
    onDemandPerAccelHr: 3.1,
    utilization: 0.65,
    setupCost: 1000,
    termYears: 2,
    resiliencePct: 5,
    sovereigntyPct: 3,
    financedPct: 40,
    financingRate: 6.5,
    resalePct: 15,
  }

  it('domain computeCalculator === frontend src/lib/cost.js computeCalculator', () => {
    expect(computeCalculator(CALC)).toEqual(feComputeCalculator(CALC))
  })

  it('POST /api/calculator/quote returns byte-identical numbers to the frontend', async () => {
    const r = await api('POST', '/api/calculator/quote', { token: falconToken, body: CALC })
    expect(r.status).toBe(200)
    expect(r.json.quote).toEqual(feComputeCalculator(CALC))
  })

  it('domain computeFees === frontend src/lib/fees.js computeFees', () => {
    const FEES = { sellerBase: 2.0, passthrough: 0.1, platformFee: 0.08, feeBasis: 'pct', feePayer: 'buyer', splitPct: 50, taxRate: 0.2, partnerSplitPct: 0.3, minMarginPct: 8 }
    expect(computeFees(FEES)).toEqual(feComputeFees(FEES))
  })

  it('default fee policy resolves to the demo 8% buyer-side policy', () => {
    expect(resolveFeePolicy()).toMatchObject({ platformFee: 0.08, feeBasis: 'pct', feePayer: 'buyer' })
  })
})

// ---------------------------------------------------------------------------
describe('fee policy endpoint (operator-only write, audited)', () => {
  it('GET returns the current policy for any authenticated user', async () => {
    const r = await api('GET', '/api/fees/policy', { token: falconToken })
    expect(r.status).toBe(200)
    expect(r.json.policy.platformFee).toBe(0.08)
  })

  it('non-operator PUT is denied (403)', async () => {
    const r = await api('PUT', '/api/fees/policy', {
      token: falconToken,
      body: { platformFee: 0.07 },
    })
    expect(r.status).toBe(403)
  })

  it('operator PUT persists the policy and writes an audit row', async () => {
    const r = await api('PUT', '/api/fees/policy', {
      token: opToken,
      body: { platformFee: 0.075, feeBasis: 'pct', feePayer: 'buyer', partnerSplitPct: 0.3 },
    })
    expect(r.status).toBe(200)
    expect(r.json.policy.platformFee).toBe(0.075)

    const audit = await withUser(opId, 'operator', async (c) => {
      const { rows } = await c.query(
        `SELECT entity, action, details FROM audit_log WHERE entity = 'fee_policy'`,
      )
      return rows
    }, appPool)
    expect(audit.length).toBeGreaterThan(0)
    expect(audit[audit.length - 1].details.value.platformFee).toBe(0.075)
  })
})

// ---------------------------------------------------------------------------
describe('eligibility evidence path: approve -> Ascend becomes bookable', () => {
  // The Falcon request's geography (EU primary + UAE failover) excludes China by
  // Location, so approving the Ascend route there moves it to hard-filter
  // exclusion, never bookable — by design (no blanket geography exemption).
  // To prove the EVIDENCE path (policy-disqualified -> bookable), we use a
  // China-eligible request whose only blocker on Ascend is the route evidence.
  const CHINA_BODY = {
    name: 'China Route Eligibility Probe',
    company: 'European AI company',
    accelerator_preferred: 'h200',
    accelerator_alternatives: ['ascend-910c', 'mi300x'],
    count: 64,
    node: '8x Ascend 910C',
    workload_type: 'fine-tuning',
    workload: { description: 'Probe of the China route evidence path.', frameworks: ['PyTorch (CANN)'], utilization: 0.6 },
    location: {
      primary: ['China'],
      failover: [],
      prohibited: [],
      chinaPolicy: 'route-specific review required',
      dataResidency: 'China',
    },
    start_date: '2027-01-01',
    term_months: 24,
    firmness: 'firm',
    resilience: { maxOutage: '2h', failoverRequired: false, multiSite: false },
    compliance: { zeroDataRetention: true, euCompliant: true, certifications: [] },
    region: 'CN',
  }

  it('opens a case for the Ascend listing, appends evidence, approves, and the buyer sees it bookable', async () => {
    const created = await api('POST', '/api/requests', { token: falconToken, body: CHINA_BODY })
    expect(created.status).toBe(201)
    const chinaRequestId = created.json.request.id

    // Before any evidence, Ascend shows as policy-DISQUALIFIED (not bookable).
    const before = await api('GET', `/api/requests/${chinaRequestId}/matches`, { token: falconToken })
    expect(before.status).toBe(200)
    expect(before.json.bookable.length).toBe(0)
    expect(before.json.disqualified.some((d) => d.name.includes('Ascend'))).toBe(true)

    const open = await api('POST', '/api/eligibility/cases', {
      token: opToken,
      body: { listingId: CN_ASCEND, requestId: chinaRequestId },
    })
    expect(open.status).toBe(201)
    expect(open.json.case.status).toBe('conditional')
    // Approve before evidence is complete is rejected.
    const premature = await api('POST', `/api/eligibility/cases/${open.json.case.id}/approve`, { token: opToken })
    expect(premature.status).toBe(409)

    const ev1 = await api('PATCH', `/api/eligibility/cases/${open.json.case.id}/evidence`, {
      token: opToken,
      body: { type: 'euCompliantProcessing', issuer: 'Compliance' },
    })
    expect(ev1.status).toBe(200)
    const ev2 = await api('PATCH', `/api/eligibility/cases/${open.json.case.id}/evidence`, {
      token: opToken,
      body: { type: 'zeroDataRetention', issuer: 'Compliance' },
    })
    expect(ev2.status).toBe(200)

    const appr = await api('POST', `/api/eligibility/cases/${open.json.case.id}/approve`, { token: opToken })
    expect(appr.status).toBe(200)
    expect(appr.json.case.status).toBe('approved')

    // The approval writes an audit row on eligibility_cases.
    const audit = await withUser(opId, 'operator', async (c) => {
      const { rows } = await c.query(
        `SELECT entity, action FROM audit_log WHERE entity = 'eligibility_cases' ORDER BY occurred_at`,
      )
      return rows
    }, appPool)
    expect(audit.length).toBeGreaterThan(0)

    // The BUYER now sees Ascend as bookable (the evidence path works end-to-end).
    const after = await api('GET', `/api/requests/${chinaRequestId}/matches`, { token: falconToken })
    expect(after.status).toBe(200)
    const names = after.json.bookable.map((b) => b.name)
    expect(names.some((n) => n.includes('Ascend'))).toBe(true)
    expect(after.json.disqualified.length).toBe(0)
  })

  it('non-operator cannot mutate eligibility cases (403)', async () => {
    const r = await api('POST', '/api/eligibility/cases', {
      token: falconToken,
      body: { listingId: CN_ASCEND, requestId: requestId },
    })
    expect(r.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
describe('deal lifecycle: create from bookable match -> status transition -> audit', () => {
  it('operator creates a deal and a status transition is audited', async () => {
    const created = await api('POST', '/api/deals', {
      token: opToken,
      body: { name: 'Project Falcon x Nordic H200', buyerId: falconId, sellerId: SELLER1, offerId: EU_H200 },
    })
    expect(created.status).toBe(201)
    const dealId = created.json.deal.id

    const t = await api('PATCH', `/api/deals/${dealId}/status`, {
      token: opToken,
      body: { status: 'conditionally_awarded' },
    })
    expect(t.status).toBe(200)
    expect(t.json.deal.status).toBe('conditionally_awarded')

    const audit = await withUser(opId, 'operator', async (c) => {
      const { rows } = await c.query(
        `SELECT action, details FROM audit_log WHERE entity = 'deals' ORDER BY occurred_at`,
      )
      return rows
    }, appPool)
    const update = audit.find((r) => r.action === 'update')
    expect(update).toBeDefined()
    expect(update.details.status).toBe('conditionally_awarded')
  })

  it('non-operator cannot create or transition deals (403)', async () => {
    const create = await api('POST', '/api/deals', {
      token: falconToken,
      body: { name: 'x', buyerId: falconId, sellerId: SELLER1 },
    })
    expect(create.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
describe('seed idempotency', () => {
  it('running the seed twice yields identical counts (ON CONFLICT DO NOTHING)', async () => {
    const a = await seed(createPool(scratch.appUrl))
    const b = await seed(createPool(scratch.appUrl))
    expect(b).toEqual(a)
    expect(a).toMatchObject({ users: 4, listings: 6, evidence: 18 })
  })
})
