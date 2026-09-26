// server/test/listing_gate.test.js
// Listing review gate — end-to-end against the real stack on a scratch DB.
//
// Covers the hole this closes: POST /api/listings used to create rows with
// status='active', so unreviewed capacity entered the live pool immediately.
// Now new listings land 'pending' and only an operator can approve them.
//
//   * seller POST creates status='pending' (client-supplied status stripped),
//     and it is invisible in the PUBLIC marketplace until approved.
//   * seller token PATCH /:id/status -> 403; unauthenticated -> 401.
//   * operator PATCH -> 'active' -> now visible in the public marketplace and
//     in the matching pool (match_listings_for_match()).
//   * operator GET ?status=pending lists the review queue; seller GET ->
//     403.
//   * matching-pool integrity: a pending listing is NOT a match candidate;
//     the same listing once active IS.
//
// Operator authentication follows api.test.js: the operator is a provisioned
// seed user (NULL password, cannot self-register); a session is minted with
// createSession().

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
    /* 204 / empty */
  }
  return { status: res.status, json }
}

const LISTING_PAYLOAD = {
  name: 'Gate H200 — pending review rack',
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
      [opId, 'gateop@sg.test'],
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

async function register(role, email) {
  return api('POST', '/api/auth/register', {
    body: { email, password: 'supersecret123', role, displayName: role },
  })
}

/** All listing ids from the live matching pool (security-definer read). */
async function matchPoolIds() {
  const res = await appPool.query("SELECT listing->>'id' AS id FROM match_listings_for_match()")
  return res.rows.map((r) => r.id)
}

describe('listing review gate', () => {
  let sellerToken
  let sellerId
  let buyerToken
  let opToken
  let listingId

  beforeAll(async () => {
    // Seller must be email-verified before it can create a listing (gated action).
    const seller = await registerVerified(api, { email: 'gateseller@sg.test', role: 'seller' })
    sellerToken = seller.json.token
    sellerId = seller.json.user.id

    const buyer = await register('buyer', 'gatebuyer@sg.test')
    buyerToken = buyer.json.token

    const op = await createSession(opId, 'operator', appPool)
    opToken = op.token
  })

  it('creates a listing as pending and strips any client-supplied status', async () => {
    const created = await api('POST', '/api/listings', {
      token: sellerToken,
      // Deliberately try to self-activate — must be ignored/stripped.
      body: { ...LISTING_PAYLOAD, status: 'active' },
    })
    expect(created.status).toBe(201)
    expect(created.json.listing.status).toBe('pending')
    expect(created.json.listing.seller_id).toBe(sellerId)
    listingId = created.json.listing.id
  })

  it('keeps a pending listing invisible in the PUBLIC marketplace', async () => {
    const pub = await api('GET', '/api/listings/marketplace')
    expect(pub.status).toBe(200)
    expect(pub.json.listings.find((l) => l.id === listingId)).toBeUndefined()
  })

  it('excludes a pending listing from the matching pool (integrity core)', async () => {
    const ids = await matchPoolIds()
    expect(ids).not.toContain(listingId)
  })

  it('rejects a seller PATCH /:id/status with 403', async () => {
    const res = await api('PATCH', `/api/listings/${listingId}/status`, {
      token: sellerToken,
      body: { status: 'active' },
    })
    expect(res.status).toBe(403)
    expect(res.json.error.code).toBe('forbidden')
  })

  it('rejects a buyer GET ?status=pending and a seller GET ?status=pending with 403', async () => {
    const buyerRes = await api('GET', '/api/listings?status=pending', { token: buyerToken })
    expect(buyerRes.status).toBe(403)
    const sellerRes = await api('GET', '/api/listings?status=pending', { token: sellerToken })
    expect(sellerRes.status).toBe(403)
  })

  it('rejects an unauthenticated PATCH with 401', async () => {
    const res = await api('PATCH', `/api/listings/${listingId}/status`, {
      body: { status: 'active' },
    })
    expect(res.status).toBe(401)
  })

  it('rejects an invalid status value with 400', async () => {
    const res = await api('PATCH', `/api/listings/${listingId}/status`, {
      token: opToken,
      body: { status: 'active_forever' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the operator PATCHes an unknown listing', async () => {
    const res = await api('PATCH', `/api/listings/${randomUUID()}/status`, {
      token: opToken,
      body: { status: 'active' },
    })
    expect(res.status).toBe(404)
  })

  it('operator sees the pending listing in the review queue', async () => {
    const queue = await api('GET', '/api/listings?status=pending', { token: opToken })
    expect(queue.status).toBe(200)
    const found = queue.json.listings.find((l) => l.id === listingId)
    expect(found).toBeTruthy()
    expect(found.status).toBe('pending')
  })

  it('operator approves the listing -> active, visible in public marketplace + matching pool', async () => {
    const approve = await api('PATCH', `/api/listings/${listingId}/status`, {
      token: opToken,
      body: { status: 'active' },
    })
    expect(approve.status).toBe(200)
    expect(approve.json.listing.status).toBe('active')

    const pub = await api('GET', '/api/listings/marketplace')
    expect(pub.json.listings.find((l) => l.id === listingId)).toBeTruthy()

    const ids = await matchPoolIds()
    expect(ids).toContain(listingId)
  })

  it('records the status transition in the immutable audit log', async () => {
    const rows = await withUser(opId, 'operator', async (c) => {
      return c.query(
        `SELECT actor, action, entity, entity_id, details->>'status' AS new_status
         FROM audit_log
         WHERE entity = 'listings' AND entity_id = $1
         ORDER BY occurred_at DESC`,
        [listingId],
      )
    }, appPool)
    // One transition: pending -> active, recorded by the operator actor, with
    // the post-UPDATE row in details.
    expect(rows.rows.length).toBeGreaterThan(0)
    expect(rows.rows[0].actor).toBe(opId)
    expect(rows.rows[0].action).toBe('update')
    expect(rows.rows[0].new_status).toBe('active')
  })

  it('operator can reject a pending listing and it stays hidden publicly', async () => {
    // Create a second listing to reject.
    const created = await api('POST', '/api/listings', {
      token: sellerToken,
      body: { ...LISTING_PAYLOAD, name: 'Gate H200 — reject me' },
    })
    expect(created.json.listing.status).toBe('pending')
    const rejectId = created.json.listing.id

    const rej = await api('PATCH', `/api/listings/${rejectId}/status`, {
      token: opToken,
      body: { status: 'rejected' },
    })
    expect(rej.status).toBe(200)
    expect(rej.json.listing.status).toBe('rejected')

    const pub = await api('GET', '/api/listings/marketplace')
    expect(pub.json.listings.find((l) => l.id === rejectId)).toBeUndefined()
    const ids = await matchPoolIds()
    expect(ids).not.toContain(rejectId)
  })
})
