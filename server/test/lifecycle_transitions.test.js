// server/test/lifecycle_transitions.test.js
// Wave N — party-driven deal lifecycle + transacted auto-observation.
//
// POST /api/deals/:id/transitions lets the deal's OWN buyer/seller drive the
// lifecycle through LEGAL_TRANSITIONS (negotiating→commercially_agreed (seller)
// →contracted (buyer) →delivered (seller) →completed (buyer); cancel from the
// first two by either party; everything else is a 409). On reaching `contracted`
// a dated Transacted observation is written to market_observations (0010).
//
// Verifies (end-to-end on a scratch DB, same harness as deal_accept.test.js):
//   * full legal path by the right party -> 200, status changed, an explicit
//     action='transition' audit row each step;
//   * wrong party (buyer on a seller-only move) -> 403; a stranger -> 403;
//     unauthenticated -> 401;
//   * illegal jumps (negotiating→delivered, completed→anything, cancelled→anything)
//     -> 409 invalid_transition with from/to in the message;
//   * cancel by either party; cancelled is terminal;
//   * the moat: contracting writes exactly ONE source='transacted' observation
//     (source_ref = 'deal:'||id, price = the listing's committed_price), a
//     repeat contracted move is impossible (409), two independent deals dedupe
//     by distinct source_ref, and the semantics of a cancel-by-seller pre-agree
//     is a no-observation for contracts not reached;
//   * operator PATCH /:id/status still works alongside (untouched legacy route).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { migrate } from '../src/db/migrate.js'
import { createPool, withUser } from '../src/db/pool.js'
import { createApp } from '../src/app.js'
import { createSession } from '../src/auth/sessions.js'
import { LEGAL_TRANSITIONS } from '../src/routes/deals.js'
import { createScratchDb, dropScratchDb } from './helpers/db.js'
import { registerVerified } from './helpers/verification.js'

let scratch
let appPool
let app
let server
let url

const opId = randomUUID()
const OP = { id: opId }

function listenExpress(a) {
  return new Promise((resolve) => {
    const srv = a.listen(0, () => resolve(srv))
  })
}
function baseUrl(srv) {
  const { port } = srv.address()
  return `http://127.0.0.1:${port}`
}
async function api(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const payload = body !== undefined && method !== 'GET' && method !== 'HEAD'
  const res = await fetch(`${url}${path}`, {
    method,
    headers,
    body: payload ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* empty */
  }
  return { status: res.status, json }
}

// A fresh active listing per call (distinct names/ids) so every deal is fully
// independent — no state leaks between tests.
let listingSeq = 0
const LISTING_PAYLOAD = {
  name: 'Lifecycle H200 core',
  provider_type: 'NVIDIA',
  gpu_model: 'H200 SXM',
  region: 'EU',
  count: 8,
  on_demand_price: 3.1,
  committed_price: 2.15,
  currency: 'USD',
}

beforeAll(async () => {
  scratch = await createScratchDb()
  await migrate({ url: scratch.url, log: () => {} })
  appPool = createPool(scratch.appUrl)

  await withUser(opId, 'operator', async (c) => {
    await c.query(
      `INSERT INTO users (id, role, email, display_name) VALUES ($1,'operator',$2,'SG Op')`,
      [opId, 'lifeop@sg.test'],
    )
  }, appPool)

  app = createApp({ pool: appPool })
  server = await listenExpress(app)
  url = baseUrl(server)
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  await appPool.end()
  await dropScratchDb(scratch.dbName)
})

// One shared buyer + seller + stranger + operator across the suite (party acts
// are our own deals; identity reuse does not collide across the independent
// listings we create per test).
let sellerToken
let buyerToken
let strangerToken
let opToken

beforeAll(async () => {
  const seller = await registerVerified(api, { email: 'liferseller@sg.test', role: 'seller', displayName: 'seller' })
  sellerToken = seller.json.token
  const buyer = await registerVerified(api, { email: 'liferbuyer@sg.test', role: 'buyer', displayName: 'buyer' })
  buyerToken = buyer.json.token
  const stranger = await registerVerified(api, { email: 'liferstranger@sg.test', role: 'buyer', displayName: 'stranger' })
  strangerToken = stranger.json.token
  opToken = (await createSession(opId, 'operator', appPool)).token
})

// This suite creates many listings/deals (several writes each). Give each test
// a fresh 60/min write budget — otherwise the global 429 write limiter would
// trip mid-suite on the cumulative count.
beforeEach(() => {
  app.locals.resetWriteRateLimiter()
})

/** Create + activate a fresh listing, then accept it as the buyer -> dealId. */
async function makeDeal(name) {
  listingSeq += 1
  const created = await api('POST', '/api/listings', {
    token: sellerToken,
    body: { ...LISTING_PAYLOAD, name: `${name} ${listingSeq}` },
  })
  const listingId = created.json.listing.id
  const approve = await api('PATCH', `/api/listings/${listingId}/status`, {
    token: opToken,
    body: { status: 'active' },
  })
  expect(approve.status).toBe(200)
  const acc = await api('POST', '/api/deals/accept', { token: buyerToken, body: { listingId } })
  expect(acc.status).toBe(201)
  return { dealId: acc.json.deal.id, listingId }
}

/** Read the explicit 'transition' audit rows for a deal (operator-scoped). */
async function transitionAudit(dealId) {
  const { rows } = await withUser(opId, 'operator', async (c) => {
    return c.query(
      `SELECT action, details FROM audit_log
       WHERE entity = 'deals' AND entity_id = $1 AND action = 'transition'
       ORDER BY occurred_at`,
      [dealId],
    )
  }, appPool)
  return rows
}

/** Read the Transacted observations (public model). */
async function transactedObs() {
  const pub = await api('GET', '/api/intel/observations')
  return pub.json.observations.filter((o) => o.source === 'transacted')
}

describe('party-driven lifecycle — full legal path', () => {
  it('the legal table is exported and matches the spec edges', () => {
    expect(LEGAL_TRANSITIONS.negotiating).toEqual({ commercially_agreed: 'seller', cancelled: 'either' })
    expect(LEGAL_TRANSITIONS.commercially_agreed).toEqual({ contracted: 'buyer', cancelled: 'either' })
    expect(LEGAL_TRANSITIONS.contracted).toEqual({ delivered: 'seller' })
    expect(LEGAL_TRANSITIONS.delivered).toEqual({ completed: 'buyer' })
    // terminal states have no party edges
    expect(LEGAL_TRANSITIONS.completed).toBeUndefined()
    expect(LEGAL_TRANSITIONS.cancelled).toBeUndefined()
  })

  it('negotiating→commercially_agreed (seller) -> 200 + audit row', async () => {
    const { dealId } = await makeDeal('path')
    const res = await api('POST', `/api/deals/${dealId}/transitions`, {
      token: sellerToken,
      body: { to: 'commercially_agreed' },
    })
    expect(res.status).toBe(200)
    expect(res.json.deal.status).toBe('commercially_agreed')
    const audit = await transitionAudit(dealId)
    expect(audit).toHaveLength(1)
    expect(audit[0].details).toEqual({ from: 'negotiating', to: 'commercially_agreed' })
  })

  it('commercially_agreed→contracted (buyer) -> 200 + audit row', async () => {
    const { dealId } = await makeDeal('path')
    await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'commercially_agreed' } })
    const res = await api('POST', `/api/deals/${dealId}/transitions`, {
      token: buyerToken,
      body: { to: 'contracted' },
    })
    expect(res.status).toBe(200)
    expect(res.json.deal.status).toBe('contracted')
    expect((await transitionAudit(dealId)).at(-1).details).toEqual({ from: 'commercially_agreed', to: 'contracted' })
  })

  it('contracted→delivered (seller) -> 200', async () => {
    const { dealId } = await makeDeal('path')
    for (const [tok, to] of [[sellerToken, 'commercially_agreed'], [buyerToken, 'contracted']]) {
      await api('POST', `/api/deals/${dealId}/transitions`, { token: tok, body: { to } })
    }
    const res = await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'delivered' } })
    expect(res.status).toBe(200)
    expect(res.json.deal.status).toBe('delivered')
  })

  it('delivered→completed (buyer) -> 200, terminal', async () => {
    const { dealId } = await makeDeal('path')
    for (const [tok, to] of [[sellerToken, 'commercially_agreed'], [buyerToken, 'contracted'], [sellerToken, 'delivered']]) {
      await api('POST', `/api/deals/${dealId}/transitions`, { token: tok, body: { to } })
    }
    const res = await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'completed' } })
    expect(res.status).toBe(200)
    expect(res.json.deal.status).toBe('completed')
    // completed is terminal for parties
    const again = await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'delivered' } })
    expect(again.status).toBe(409)
    expect(again.json.error.code).toBe('invalid_transition')
  })
})

describe('wrong party / non-participant', () => {
  it('buyer cannot make the seller-only negotiating→commercially_agreed move -> 403', async () => {
    const { dealId } = await makeDeal('wrongparty')
    const res = await api('POST', `/api/deals/${dealId}/transitions`, {
      token: buyerToken,
      body: { to: 'commercially_agreed' },
    })
    expect(res.status).toBe(403)
    expect(res.json.error.code).toBe('forbidden')
  })

  it('seller cannot make the buyer-only commercially_agreed→contracted move -> 403', async () => {
    const { dealId } = await makeDeal('wrongparty')
    await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'commercially_agreed' } })
    const res = await api('POST', `/api/deals/${dealId}/transitions`, {
      token: sellerToken,
      body: { to: 'contracted' },
    })
    expect(res.status).toBe(403)
    expect(res.json.error.code).toBe('forbidden')
    // status is unchanged
    const deal = await api('GET', `/api/deals/${dealId}`, { token: buyerToken })
    expect(deal.json.deal.status).toBe('commercially_agreed')
  })

  it('a stranger (not a party) -> 403 even when the deal exists', async () => {
    const { dealId } = await makeDeal('stranger')
    const res = await api('POST', `/api/deals/${dealId}/transitions`, {
      token: strangerToken,
      body: { to: 'cancelled' },
    })
    expect(res.status).toBe(403)
    expect(res.json.error.code).toBe('forbidden')
  })

  it('no token -> 401', async () => {
    const { dealId } = await makeDeal('noauth')
    const res = await api('POST', `/api/deals/${dealId}/transitions`, { body: { to: 'cancelled' } })
    expect(res.status).toBe(401)
  })
})

describe('illegal transitions', () => {
  it('negotiating→delivered (skip) -> 409 with from/to in the message', async () => {
    const { dealId } = await makeDeal('illegal')
    const res = await api('POST', `/api/deals/${dealId}/transitions`, {
      token: buyerToken,
      body: { to: 'delivered' },
    })
    expect(res.status).toBe(409)
    expect(res.json.error.code).toBe('invalid_transition')
    expect(res.json.error.message).toContain('negotiating')
    expect(res.json.error.message).toContain('delivered')
  })

  it('completed→anything -> 409 (terminal)', async () => {
    const { dealId } = await makeDeal('illegal')
    for (const [tok, to] of [[sellerToken, 'commercially_agreed'], [buyerToken, 'contracted'], [sellerToken, 'delivered'], [buyerToken, 'completed']]) {
      await api('POST', `/api/deals/${dealId}/transitions`, { token: tok, body: { to } })
    }
    for (const to of ['negotiating', 'contracted', 'delivered', 'cancelled']) {
      const res = await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to } })
      expect(res.status).toBe(409)
      expect(res.json.error.code).toBe('invalid_transition')
    }
  })
})

describe('cancel', () => {
  it('the seller may cancel from negotiating -> 200, cancelled is terminal', async () => {
    const { dealId } = await makeDeal('cancel')
    const res = await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'cancelled' } })
    expect(res.status).toBe(200)
    expect(res.json.deal.status).toBe('cancelled')
    const again = await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'commercially_agreed' } })
    expect(again.status).toBe(409)
  })

  it('the buyer may cancel from negotiating -> 200', async () => {
    const { dealId } = await makeDeal('cancel')
    const res = await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'cancelled' } })
    expect(res.status).toBe(200)
    expect(res.json.deal.status).toBe('cancelled')
  })

  it('either party may cancel from commercially_agreed -> 200', async () => {
    const { dealId } = await makeDeal('cancel')
    await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'commercially_agreed' } })
    const res = await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'cancelled' } })
    expect(res.status).toBe(200)
    expect(res.json.deal.status).toBe('cancelled')
  })
})

describe('auto-observation on contracted (the moat)', () => {
  it('contracting a deal writes ONE Transacted observation (price = committed_price)', async () => {
    const { dealId, listingId } = await makeDeal('observe')
    await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'commercially_agreed' } })
    const res = await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'contracted' } })
    expect(res.status).toBe(200)

    const obs = (await transactedObs()).filter((o) => o.source_ref === `deal:${dealId}`)
    expect(obs).toHaveLength(1)
    const o = obs[0]
    expect(o.level).toBe('Transacted')
    expect(o.accelerator).toBe('H200 SXM')
    expect(o.family).toBe('H200')
    expect(o.region).toBe('EU')
    expect(o.price).toBe(2.15) // listing committed_price (per accel-hr)
    expect(o.unit).toBe('usd/accel-hr')
    expect(o.source).toBe('transacted')
  })

  it('re-running the contracted transition is impossible (409) and yields NO duplicate observation', async () => {
    const { dealId } = await makeDeal('observe')
    await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'commercially_agreed' } })
    await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'contracted' } })
    const again = await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'contracted' } })
    expect(again.status).toBe(409)
    expect((await transactedObs()).filter((o) => o.source_ref === `deal:${dealId}`)).toHaveLength(1)
  })

  it('two independent deals produce two distinct transacted observations (dedupe by source_ref)', async () => {
    const a = await makeDeal('observeA')
    const b = await makeDeal('observeB')
    for (const { dealId } of [a, b]) {
      await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'commercially_agreed' } })
      await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'contracted' } })
    }
    const obs = await transactedObs()
    const mine = obs.filter((o) => o.source_ref === `deal:${a.dealId}` || o.source_ref === `deal:${b.dealId}`)
    expect(mine).toHaveLength(2)
    expect(new Set(mine.map((o) => o.source_ref)).size).toBe(2)
  })

  it('unit-level: calling deal_contract_observation twice for the same deal yields ONE row (ON CONFLICT DO NOTHING)', async () => {
    const { dealId } = await makeDeal('unit')
    await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'commercially_agreed' } })
    await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'contracted' } })
    // Direct double-call on the SD helper — the dedupe arbiter must swallow it.
    await withUser(opId, 'operator', async (c) => {
      await c.query('SELECT deal_contract_observation($1)', [dealId])
      await c.query('SELECT deal_contract_observation($1)', [dealId])
    }, appPool)
    const { rows } = await withUser(opId, 'operator', async (c) => {
      return c.query(`SELECT count(*)::int AS n FROM market_observations
                      WHERE source = 'transacted' AND source_ref = $1`, [`deal:${dealId}`])
    }, appPool)
    expect(rows[0].n).toBe(1)
  })

  it('a seller pre-agree alone (not contracted) writes NO transacted observation', async () => {
    const { dealId } = await makeDeal('nobs')
    await api('POST', `/api/deals/${dealId}/transitions`, { token: sellerToken, body: { to: 'commercially_agreed' } })
    expect((await transactedObs()).filter((o) => o.source_ref === `deal:${dealId}`)).toHaveLength(0)
  })

  it('an aborted observation path can never outlive a failed transition (nothing writes on 409)', async () => {
    const { dealId } = await makeDeal('abort')
    // Illegal jump never reaches contracted, so no observation is written.
    const res = await api('POST', `/api/deals/${dealId}/transitions`, { token: buyerToken, body: { to: 'contracted' } })
    expect(res.status).toBe(409)
    expect((await transactedObs()).filter((o) => o.source_ref === `deal:${dealId}`)).toHaveLength(0)
  })
})

describe('operator PATCH coexistence', () => {
  it('the operator PATCH /:id/status route still works alongside party transitions', async () => {
    const { dealId } = await makeDeal('op')
    const res = await api('PATCH', `/api/deals/${dealId}/status`, {
      token: opToken,
      body: { status: 'commercially_agreed' },
    })
    expect(res.status).toBe(200)
    expect(res.json.deal.status).toBe('commercially_agreed')
  })
})
