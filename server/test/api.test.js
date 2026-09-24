// server/test/api.test.js
// End-to-end HTTP tests for the Wave B auth + API layer.
//
// Spins the real Express app (via createApp) on an ephemeral port and drives it
// with node fetch against a scratch database, so these exercise the full stack:
// middleware -> zod -> RLS-scoped DB -> audit triggers -> error handler.
//
// Operator authentication: the operator is a seed user provisioned via SQL (no
// password, cannot self-register or login through the HTTP API). Tests mint an
// operator session with createSession() — the same mechanism a provisioned
// operator would use — and use that bearer token for operator routes.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { migrate } from '../src/db/migrate.js'
import { createPool, withUser } from '../src/db/pool.js'
import { createApp } from '../src/app.js'
import { createSession } from '../src/auth/sessions.js'
import { createScratchDb, dropScratchDb } from './helpers/db.js'

let scratch
let appPool
let app
let server
let url

const ids = { op: randomUUID() }

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

async function registerBuyer(email) {
  return api('POST', '/api/auth/register', {
    body: { email, password: 'supersecret123', role: 'buyer', displayName: 'Buyer' },
  })
}
async function registerSeller(email) {
  return api('POST', '/api/auth/register', {
    body: { email, password: 'supersecret123', role: 'seller', displayName: 'Seller' },
  })
}

beforeAll(async () => {
  scratch = await createScratchDb()
  await migrate({ url: scratch.url, log: () => {} })
  appPool = createPool(scratch.appUrl)

  // Provision the operator seed (NULL password -> cannot self-authenticate).
  await withUser(ids.op, 'operator', async (c) => {
    await c.query(
      `INSERT INTO users (id, role, email, display_name) VALUES ($1,'operator',$2,'SG Operator')`,
      [ids.op, 'operator@sg.test'],
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

// ---------------------------------------------------------------------------
describe('auth happy paths', () => {
  it('registers a buyer and returns token + user', async () => {
    const r = await registerBuyer('regA@sg.test')
    expect(r.status).toBe(201)
    expect(typeof r.json.token).toBe('string')
    expect(r.json.token.length).toBeGreaterThan(32)
    expect(r.json.user).toMatchObject({ role: 'buyer', email: 'rega@sg.test', displayName: 'Buyer' })
    expect(r.json.user.password_hash).toBeUndefined()
    expect(r.json.user.id).toBeTruthy()
  })

  it('logs in with correct password', async () => {
    const reg = await registerBuyer('login@sg.test')
    const r = await api('POST', '/api/auth/login', {
      body: { email: 'login@sg.test', password: 'supersecret123' },
    })
    expect(r.status).toBe(200)
    expect(typeof r.json.token).toBe('string')
    expect(r.json.user.role).toBe('buyer')
    expect(r.json.user.password_hash).toBeUndefined()
    // login token works and the register token also remains valid
    expect(reg.status).toBe(201)
  })

  it('GET /me returns the current user for a valid session', async () => {
    const reg = await registerBuyer('me@sg.test')
    const r = await api('GET', '/api/auth/me', { token: reg.json.token })
    expect(r.status).toBe(200)
    expect(r.json.user.email).toBe('me@sg.test')
    expect(r.json.user.role).toBe('buyer')
  })

  it('logout invalidates the session', async () => {
    const reg = await registerBuyer('logout@sg.test')
    const login = await api('POST', '/api/auth/login', {
      body: { email: 'logout@sg.test', password: 'supersecret123' },
    })
    const out = await api('POST', '/api/auth/logout', { token: login.json.token })
    expect(out.status).toBe(204)
    // the logged-out token no longer authenticates
    const me = await api('GET', '/api/auth/me', { token: login.json.token })
    expect(me.status).toBe(401)
  })
})

describe('auth rejection paths', () => {
  it('rejects a wrong password with 401', async () => {
    await registerBuyer('wrongpw@sg.test')
    const r = await api('POST', '/api/auth/login', {
      body: { email: 'wrongpw@sg.test', password: 'totallywrong' },
    })
    expect(r.status).toBe(401)
    expect(r.json.error.code).toBe('unauthorized')
  })

  it('rejects an unknown email with the same generic 401', async () => {
    const r = await api('POST', '/api/auth/login', {
      body: { email: 'nobody@sg.test', password: 'supersecret123' },
    })
    expect(r.status).toBe(401)
    expect(r.json.error.code).toBe('unauthorized')
  })

  it('rejects a weak password via zod (400)', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { email: 'weak@sg.test', password: 'short', role: 'buyer' },
    })
    expect(r.status).toBe(400)
    expect(r.json.error.code).toBe('validation_failed')
  })

  it('rejects operator self-registration via zod (400)', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { email: 'evilop@sg.test', password: 'supersecret123', role: 'operator' },
    })
    expect(r.status).toBe(400)
    expect(r.json.error.code).toBe('validation_failed')
  })

  it('rejects duplicate email with 409', async () => {
    await registerBuyer('dup@sg.test')
    const r = await registerBuyer('dup@sg.test')
    expect(r.status).toBe(409)
  })
})

// ---------------------------------------------------------------------------
describe('protected routes return 401 without a token (deny by default)', () => {
  const id = randomUUID()
  const protectedRoutes = [
    ['POST', '/api/requests'],
    ['GET', '/api/requests'],
    ['GET', `/api/requests/${id}`],
    ['POST', '/api/listings'],
    ['GET', '/api/listings'],
    ['POST', '/api/deals'],
    ['GET', '/api/deals'],
    ['GET', `/api/deals/${id}`],
    ['PATCH', `/api/deals/${id}/status`],
    ['POST', `/api/deals/${id}/approvals`],
    ['GET', `/api/deals/${id}/messages`],
    ['POST', `/api/deals/${id}/messages`],
    ['POST', '/api/auth/logout'],
    ['GET', '/api/auth/me'],
  ]

  it.each(protectedRoutes)('%s %s -> 401', async (method, path) => {
    const r = await api(method, path, { body: {} })
    expect(r.status).toBe(401)
    expect(r.json.error.code).toBe('unauthorized')
  })

  it('marketplace is public (200, not 401)', async () => {
    const r = await api('GET', '/api/listings/marketplace')
    expect(r.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
describe('requests (buyer-scoped)', () => {
  let buyerA
  let buyerB

  beforeAll(async () => {
    buyerA = (await registerBuyer('reqA@sg.test')).json
    buyerB = (await registerBuyer('reqB@sg.test')).json
  })

  it('buyer creates a request and sees it in their list', async () => {
    const created = await api('POST', '/api/requests', {
      token: buyerA.token,
      body: { name: 'H100 cluster', count: 8, region: 'EU' },
    })
    expect(created.status).toBe(201)
    expect(created.json.request.buyer_id).toBe(buyerA.user.id)
    expect(created.json.request.name).toBe('H100 cluster')

    const list = await api('GET', '/api/requests', { token: buyerA.token })
    expect(list.status).toBe(200)
    expect(list.json.requests.length).toBeGreaterThanOrEqual(1)
  })

  it('buyer cannot create a request as a seller role (403)', async () => {
    const seller = await registerSeller('notbuyer@sg.test')
    const r = await api('POST', '/api/requests', {
      token: seller.json.token,
      body: { name: 'nope' },
    })
    expect(r.status).toBe(403)
  })

  it('IDOR: buyer B gets 404 for buyer A request', async () => {
    const created = await api('POST', '/api/requests', {
      token: buyerA.token,
      body: { name: 'private request', count: 1, region: 'GCC' },
    })
    expect(created.status).toBe(201)
    const reqId = created.json.request.id

    const asB = await api('GET', `/api/requests/${reqId}`, { token: buyerB.token })
    expect(asB.status).toBe(404)

    const asA = await api('GET', `/api/requests/${reqId}`, { token: buyerA.token })
    expect(asA.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
describe('listings + public marketplace', () => {
  let buyer
  let seller

  beforeAll(async () => {
    buyer = (await registerBuyer('mkbuyer@sg.test')).json
    seller = (await registerSeller('mkseller@sg.test')).json
  })

  it('seller creates a listing with a committed price', async () => {
    const r = await api('POST', '/api/listings', {
      token: seller.token,
      body: {
        name: 'MI300X rack',
        provider_type: 'AMD',
        gpu_model: 'MI300X',
        region: 'GCC',
        count: 16,
        committed_price: 2.5,
        on_demand_price: 3.1,
        currency: 'USD',
      },
    })
    expect(r.status).toBe(201)
    expect(r.json.listing.seller_id).toBe(seller.user.id)
    expect(r.json.listing.committed_price).toBe(2.5)
  })

  it('buyer cannot create listings (403)', async () => {
    const r = await api('POST', '/api/listings', {
      token: buyer.token,
      body: { name: 'x', provider_type: 'NVIDIA', gpu_model: 'H200', region: 'EU' },
    })
    expect(r.status).toBe(403)
  })

  it('marketplace returns ONLY safe/anonymized fields (no seller_id, no committed_price)', async () => {
    const r = await api('GET', '/api/listings/marketplace')
    expect(r.status).toBe(200)
    expect(r.json.listings.length).toBeGreaterThanOrEqual(1)
    const item = r.json.listings[0]
    // safe fields present
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('name')
    expect(item).toHaveProperty('provider_type')
    expect(item).toHaveProperty('gpu_model')
    expect(item).toHaveProperty('region')
    expect(item).toHaveProperty('on_demand_price')
    // forbidden fields ABSENT
    expect(item).not.toHaveProperty('seller_id')
    expect(item).not.toHaveProperty('committed_price')
    // seller cannot see other sellers' committed_price through marketplace either
    for (const it of r.json.listings) {
      expect(it).not.toHaveProperty('seller_id')
      expect(it).not.toHaveProperty('committed_price')
    }
  })
})

// ---------------------------------------------------------------------------
describe('deals, approvals, messages + audit', () => {
  let opToken
  let buyer
  let seller
  let dealId

  beforeAll(async () => {
    ;({ token: opToken } = await createSession(ids.op, 'operator', appPool))
    buyer = (await registerBuyer('dealbuyer@sg.test')).json
    seller = (await registerSeller('dealseller@sg.test')).json
  })

  it('seller cannot create a deal (403) — operator only', async () => {
    const r = await api('POST', '/api/deals', {
      token: seller.token,
      body: { name: 'x', buyerId: buyer.user.id, sellerId: seller.user.id },
    })
    expect(r.status).toBe(403)
  })

  it('operator creates a deal with buyer+seller parties', async () => {
    const r = await api('POST', '/api/deals', {
      token: opToken,
      body: { name: 'Falcon x Nordic', buyerId: buyer.user.id, sellerId: seller.user.id },
    })
    expect(r.status).toBe(201)
    expect(r.json.deal.name).toBe('Falcon x Nordic')
    dealId = r.json.deal.id
  })

  it('deal status transition writes an audit_log row', async () => {
    const r = await api('PATCH', `/api/deals/${dealId}/status`, {
      token: opToken,
      body: { status: 'conditionally_awarded' },
    })
    expect(r.status).toBe(200)
    expect(r.json.deal.status).toBe('conditionally_awarded')

    const rows = await withUser(ids.op, 'operator', async (c) => {
      const { rows } = await c.query(
        `SELECT entity, action, details FROM audit_log
         WHERE entity='deals' AND action='update'`,
      )
      return rows
    }, appPool)
    expect(rows.length).toBe(1)
    expect(rows[0].details.status).toBe('conditionally_awarded')
  })

  it('non-operator cannot change deal status (403)', async () => {
    const r = await api('PATCH', `/api/deals/${dealId}/status`, {
      token: buyer.token,
      body: { status: 'contracted' },
    })
    expect(r.status).toBe(403)
  })

  it('approval POST writes an audit_log row', async () => {
    const r = await api('POST', `/api/deals/${dealId}/approvals`, {
      token: opToken,
      body: { scope: 'route_reviewer_decision', decision: 'approved', detail: 'ok' },
    })
    expect(r.status).toBe(201)
    expect(r.json.approval.scope).toBe('route_reviewer_decision')

    const rows = await withUser(ids.op, 'operator', async (c) => {
      const { rows } = await c.query(
        `SELECT entity, action, details FROM audit_log WHERE entity='approvals' AND action='insert'`,
      )
      return rows
    }, appPool)
    expect(rows.length).toBe(1)
    expect(rows[0].details.scope).toBe('route_reviewer_decision')
  })

  it('parties can post and read messages; operator approves; non-party sees none', async () => {
    const posted = await api('POST', `/api/deals/${dealId}/messages`, {
      token: buyer.token,
      body: { body: 'hi from buyer' },
    })
    expect(posted.status).toBe(201)
    expect(posted.json.message.from_role).toBe('buyer')

    const thread = await api('GET', `/api/deals/${dealId}/messages`, { token: seller.token })
    expect(thread.status).toBe(200)
    expect(thread.json.messages.length).toBe(1)
    expect(thread.json.messages[0].body).toBe('hi from buyer')

    const opMsg = await api('POST', `/api/deals/${dealId}/messages`, {
      token: opToken,
      body: { body: 'noted' },
    })
    expect(opMsg.status).toBe(201)
  })

  it('IDOR: seller token on operator approve route -> 403', async () => {
    const r = await api('POST', `/api/deals/${dealId}/approvals`, {
      token: seller.token,
      body: { scope: 'x', decision: 'rejected' },
    })
    expect(r.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
describe('login rate limit (fresh app instance)', () => {
  let app2
  let server2
  let url2

  beforeAll(async () => {
    app2 = createApp({ pool: appPool })
    server2 = await listenExpress(app2)
    url2 = baseUrl(server2)
  })
  afterAll(async () => {
    await new Promise((r) => server2.close(r))
  })

  it('allows 10 attempts then returns 429 on the 11th within a minute', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await fetch(`${url2}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ratelimit@sg.test', password: 'wrong' }),
      })
      expect(r.status).toBe(401)
    }
    const eleventh = await fetch(`${url2}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ratelimit@sg.test', password: 'wrong' }),
    })
    expect(eleventh.status).toBe(429)
    expect(eleventh.headers.get('retry-after')).toBeTruthy()
  })
})
