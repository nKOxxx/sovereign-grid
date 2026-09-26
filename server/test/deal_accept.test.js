// server/test/deal_accept.test.js
// Buyer offer-acceptance — deals via POST /api/deals/accept (close the loop).
//
// End-to-end against the real stack on a scratch DB (same harness as
// listing_gate.test.js). A buyer can now accept an ACTIVE listing themselves;
// previously deals were operator-created only.
//
//   * buyer accepts an active listing -> 201; the deal starts at
//     DEAL_STATUSES[0] ('negotiating'), references the listing, and its
//     deal_parties are buyer=self + seller=listings.seller_id.
//   * repeat accept is idempotent -> 200 with the same deal id.
//   * unknown listingId -> 404; a pending (not-yet-approved) listing -> 409.
//   * seller token -> 403; unauthenticated -> 401.
//   * the operator can move the accepted deal through its lifecycle (existing
//     PATCH /:id/status transition still works on it).
//   * golden safety: acceptance never mutates listing.status (no 'booked'
//     states) — the listing stays 'active' through the whole flow.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { migrate } from '../src/db/migrate.js'
import { createPool, withUser } from '../src/db/pool.js'
import { createApp } from '../src/app.js'
import { createSession } from '../src/auth/sessions.js'
import { createScratchDb, dropScratchDb } from './helpers/db.js'
import { registerVerified } from './helpers/verification.js'

let scratch
let appPool
let app
let server
let url

const opId = randomUUID()

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
    /* 204 / empty */
  }
  return { status: res.status, json }
}

const LISTING_PAYLOAD = {
  name: 'Accept H200 — buyers may book me',
  provider_type: 'NVIDIA',
  gpu_model: 'H200 SXM',
  region: 'EU',
  count: 8,
  on_demand_price: 2.45,
  committed_price: 2.1,
  currency: 'USD',
}

beforeAll(async () => {
  scratch = await createScratchDb()
  await migrate({ url: scratch.url, log: () => {} })
  appPool = createPool(scratch.appUrl)

  // Provision the operator seed (NULL password -> cannot self-authenticate).
  await withUser(opId, 'operator', async (c) => {
    await c.query(
      `INSERT INTO users (id, role, email, display_name) VALUES ($1,'operator',$2,'SG Operator')`,
      [opId, 'acceptop@sg.test'],
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

/** Create a listing (always lands 'pending'); returns the listing row. */
async function createPendingListing(sellerToken, name) {
  const res = await api('POST', '/api/listings', {
    token: sellerToken,
    body: { ...LISTING_PAYLOAD, name },
  })
  return res.json.listing
}

/** Parties of a deal as { role: userId } (operator-scoped read). */
async function dealParties(dealId) {
  const { rows } = await withUser(opId, 'operator', async (c) => {
    return c.query('SELECT user_id, role FROM deal_parties WHERE deal_id = $1', [dealId])
  }, appPool)
  const map = {}
  for (const r of rows) map[r.role] = r.user_id
  return map
}

describe('buyer offer-acceptance', () => {
  let sellerToken
  let sellerId
  let buyerToken
  let buyerId
  let opToken
  let listingId

  beforeAll(async () => {
    // Seller must be email-verified to create a listing; buyer to accept one.
    const seller = await registerVerified(api, {
      email: 'accseller@sg.test',
      role: 'seller',
      displayName: 'seller',
    })
    sellerToken = seller.json.token
    sellerId = seller.json.user.id

    const buyer = await registerVerified(api, {
      email: 'accbuyer@sg.test',
      role: 'buyer',
      displayName: 'buyer',
    })
    buyerToken = buyer.json.token
    buyerId = buyer.json.user.id

    const op = await createSession(opId, 'operator', appPool)
    opToken = op.token

    // Active listing: seller creates (pending) then operator approves.
    const created = await createPendingListing(sellerToken, 'Accept H200 — buyers may book me')
    listingId = created.id
    const approve = await api('PATCH', `/api/listings/${listingId}/status`, {
      token: opToken,
      body: { status: 'active' },
    })
    expect(approve.status).toBe(200)
    expect(approve.json.listing.status).toBe('active')
  })

  it('buyer accepts an active listing -> 201 deal at the first lifecycle status', async () => {
    const res = await api('POST', '/api/deals/accept', {
      token: buyerToken,
      body: { listingId },
    })
    expect(res.status).toBe(201)
    expect(res.json.deal.listing_id).toBe(listingId)
    expect(res.json.deal.status).toBe('negotiating') // DEAL_STATUSES[0]
  })

  it('the accepted deal references the buyer and the listing seller as its parties', async () => {
    const res = await api('POST', '/api/deals/accept', {
      token: buyerToken,
      body: { listingId },
    })
    const dealId = res.json.deal.id
    const parties = await dealParties(dealId)
    expect(parties.buyer).toBe(buyerId)
    expect(parties.seller).toBe(sellerId)
    expect(parties.operator).toBeUndefined() // buyer-initiated, no operator party
  })

  it('repeat accept is idempotent -> 200 with the SAME deal id', async () => {
    const first = await api('POST', '/api/deals/accept', {
      token: buyerToken,
      body: { listingId },
    })
    const second = await api('POST', '/api/deals/accept', {
      token: buyerToken,
      body: { listingId },
    })
    expect(first.status).toBe(200) // already open from the previous test
    expect(second.status).toBe(200)
    expect(second.json.deal.id).toBe(first.json.deal.id)
    // still only one deal row + two parties for this (buyer, listing)
    const { rows } = await withUser(opId, 'operator', async (c) => {
      return c.query(
        `SELECT COUNT(*)::int AS n FROM deals d
         JOIN deal_parties dp ON dp.deal_id = d.id
         WHERE d.listing_id = $1 AND dp.user_id = $2 AND dp.role = 'buyer'`,
        [listingId, buyerId],
      )
    }, appPool)
    expect(rows[0].n).toBe(1)
  })

  it('unknown listingId -> 404', async () => {
    const res = await api('POST', '/api/deals/accept', {
      token: buyerToken,
      body: { listingId: randomUUID() },
    })
    expect(res.status).toBe(404)
    expect(res.json.error.code).toBe('not_found')
  })

  it('a pending (not-yet-approved) listing -> 409 conflict', async () => {
    const pending = await createPendingListing(sellerToken, 'Accept H200 — not approved')
    const res = await api('POST', '/api/deals/accept', {
      token: buyerToken,
      body: { listingId: pending.id },
    })
    expect(res.status).toBe(409)
    expect(res.json.error.code).toBe('conflict')
  })

  it('a seller token -> 403 forbidden', async () => {
    const res = await api('POST', '/api/deals/accept', {
      token: sellerToken,
      body: { listingId },
    })
    expect(res.status).toBe(403)
    expect(res.json.error.code).toBe('forbidden')
  })

  it('no token -> 401 unauthorized', async () => {
    const res = await api('POST', '/api/deals/accept', { body: { listingId } })
    expect(res.status).toBe(401)
  })

  it('operator can still move the accepted deal through its lifecycle (PATCH /:id/status)', async () => {
    const res = await api('POST', '/api/deals/accept', {
      token: buyerToken,
      body: { listingId },
    })
    const dealId = res.json.deal.id
    const next = await api('PATCH', `/api/deals/${dealId}/status`, {
      token: opToken,
      body: { status: 'commercially_agreed' },
    })
    expect(next.status).toBe(200)
    expect(next.json.deal.status).toBe('commercially_agreed')
    expect(next.json.deal.id).toBe(dealId)
  })

  it('golden safety: acceptance never mutates the listing status (stays active)', async () => {
    // The active listing remains 'active' after buyer acceptance — no 'booked'
    // state, so golden replays stay deterministic.
    const pub = await api('GET', '/api/listings/marketplace')
    const found = pub.json.listings.find((l) => l.id === listingId)
    expect(found).toBeTruthy()
    expect(found.status).toBe('active')
  })
})
