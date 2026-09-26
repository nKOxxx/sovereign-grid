// server/test/seller_onboarding.test.js
// Seller onboarding end-to-end against the real stack (middleware -> zod ->
// RLS-scoped DB -> audit) on an isolated scratch database:
//   register seller -> login -> POST /api/listings -> GET shows it (round-trip).
// Negative paths: unauthenticated POST -> 401, buyer-token POST -> 403.
// The scratch DB is created fresh and DROPPED in afterAll, so the production
// database is never touched (same harness as api.test.js / rls.test.js).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { migrate } from '../src/db/migrate.js'
import { createPool } from '../src/db/pool.js'
import { createApp } from '../src/app.js'
import { createScratchDb, dropScratchDb } from './helpers/db.js'

let scratch
let appPool
let app
let server
let url

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
    /* 204 / empty body */
  }
  return { status: res.status, json }
}

const LISTING_PAYLOAD = {
  name: 'Onboarding H200 — test rack',
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
  app = createApp({ pool: appPool })
  server = await listenExpress(app)
  url = baseUrl(server)
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  await appPool.end()
  // Recreate + drop guarantees the prod DB stays pristine (dropScratchDb closes
  // any lingering connections with FORCE).
  await dropScratchDb(scratch.dbName)
})

describe('seller onboarding round-trip', () => {
  it('registers a seller, logs in, creates a listing, and GET shows it', async () => {
    const email = 'onboardseller@sg.test'
    const password = 'supersecret123'

    // 1. register seller -> 201, token + user(role=seller)
    const reg = await api('POST', '/api/auth/register', {
      body: { email, password, role: 'seller', displayName: 'Onboard Grid' },
    })
    expect(reg.status).toBe(201)
    expect(reg.json.user.role).toBe('seller')
    expect(reg.json.user.password_hash).toBeUndefined()

    // 2. login -> 200, fresh token
    const loginRes = await api('POST', '/api/auth/login', {
      body: { email, password },
    })
    expect(loginRes.status).toBe(200)
    expect(loginRes.json.user.role).toBe('seller')
    const token = loginRes.json.token

    // 3. POST /api/listings as seller -> 201 with exact payload round-trip
    const created = await api('POST', '/api/listings', {
      token,
      body: LISTING_PAYLOAD,
    })
    expect(created.status).toBe(201)
    expect(created.json.listing).toMatchObject({
      name: LISTING_PAYLOAD.name,
      provider_type: 'NVIDIA',
      gpu_model: 'H200 SXM',
      region: 'EU',
      count: 8,
      on_demand_price: 2.45,
      committed_price: 2.1,
      currency: 'USD',
    })

    // 4. GET /api/listings (seller-scoped) shows the created row
    const list = await api('GET', '/api/listings', { token })
    expect(list.status).toBe(200)
    expect(Array.isArray(list.json.listings)).toBe(true)
    const found = list.json.listings.find((l) => l.id === created.json.listing.id)
    expect(found).toBeTruthy()
    expect(found).toMatchObject({
      name: LISTING_PAYLOAD.name,
      gpu_model: 'H200 SXM',
      region: 'EU',
      on_demand_price: 2.45,
    })

    // Round-trips through the raw row (not just the response echo).
    expect(found.seller_id).toBe(reg.json.user.id)
  })

  it('rejects an unauthenticated POST /api/listings with 401', async () => {
    const res = await api('POST', '/api/listings', { body: LISTING_PAYLOAD })
    expect(res.status).toBe(401)
    expect(res.json.error.code).toBe('unauthorized')
  })

  it('rejects a buyer-token POST /api/listings with 403', async () => {
    const buyer = await api('POST', '/api/auth/register', {
      body: { email: 'onboardbuyer@sg.test', password: 'supersecret123', role: 'buyer' },
    })
    expect(buyer.status).toBe(201)

    const res = await api('POST', '/api/listings', {
      token: buyer.json.token,
      body: LISTING_PAYLOAD,
    })
    expect(res.status).toBe(403)
    expect(res.json.error.code).toBe('forbidden')
  })
})
