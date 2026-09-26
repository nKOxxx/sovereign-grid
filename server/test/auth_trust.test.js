// server/test/auth_trust.test.js
// Wave M account-trust bundle: email verification, gated actions, password
// reset, operator token hand-off, and the strict auth rate limits.
//
// Same scratch-DB harness as api.test.js. Because self-service registrations
// are now UNVERIFIED and gated, this file exercises:
//   * register -> verificationRequired:true, emailVerified:false (login too)
//   * /verify single-use token through the public endpoint (dev console log)
//   * gated actions: unverified seller cannot create a listing, unverified
//     buyer cannot accept a deal (403 email_unverified) — verified ones can
//   * /resend issue a fresh token for an unverified account
//   * /reset-request always 200 (no enumeration) + /reset consumes the
//     purpose='reset' token, changes the password, and logs out old sessions
//   * operator hand-off: GET /api/operator/verifications never leaks the token;
//     POST :id/reveal returns it once (410 on repeat) and audits the reveal
//   * strict 10/15min buckets trip 429 on the 11th auth write (fresh app)

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

/** Run a function while capturing console.info, restore after. */
async function withCapturedInfo(fn) {
  const logs = []
  const orig = console.info
  console.info = (...a) => logs.push(a.join(' '))
  let out
  try {
    out = await fn()
  } finally {
    console.info = orig
  }
  return { out, logs }
}

/** Register WITHOUT verifying (returns register response + captured logs). */
async function registerRaw(role, email) {
  return withCapturedInfo(() =>
    api('POST', '/api/auth/register', {
      body: { email, password: 'supersecret123', role, displayName: role },
    }),
  )
}

beforeAll(async () => {
  scratch = await createScratchDb()
  await migrate({ url: scratch.url, log: () => {} })
  appPool = createPool(scratch.appUrl)
  await withUser(opId, 'operator', async (c) => {
    await c.query(
      `INSERT INTO users (id, role, email, display_name) VALUES ($1,'operator',$2,'SG Operator')`,
      [opId, 'trustop@sg.test'],
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

describe('email verification', () => {
  it('register flags verificationRequired and login reports emailVerified=false', async () => {
    const reg = await api('POST', '/api/auth/register', {
      body: { email: 'vreg@sg.test', password: 'supersecret123', role: 'seller' },
    })
    expect(reg.status).toBe(201)
    expect(reg.json.verificationRequired).toBe(true)
    expect(reg.json.user.emailVerified).toBe(false)

    const login = await api('POST', '/api/auth/login', {
      body: { email: 'vreg@sg.test', password: 'supersecret123' },
    })
    expect(login.status).toBe(200)
    expect(login.json.user.emailVerified).toBe(false)
  })

  it('gates seller listing creation until verified (403 email_unverified)', async () => {
    const { out: reg } = await registerRaw('seller', 'gatev@sg.test')
    expect(reg.status).toBe(201)
    const denied = await api('POST', '/api/listings', {
      token: reg.json.token,
      body: { name: 'x', provider_type: 'NVIDIA', gpu_model: 'H200', region: 'EU' },
    })
    expect(denied.status).toBe(403)
    expect(denied.json.error.code).toBe('email_unverified')
  })

  it('verify consumes the token once and unblocks the account', async () => {
    // registerVerified registers through the dev VERIFY_TOKEN console log and
    // consumes it via the public /verify endpoint — the same path a dev uses.
    const verified = await registerVerified(api, { email: 'verify2@sg.test', role: 'seller' })
    expect(verified.status).toBe(201)
    expect(verified.json.verificationRequired).toBe(true)

    const login = await api('POST', '/api/auth/login', {
      body: { email: 'verify2@sg.test', password: 'supersecret123' },
    })
    expect(login.json.user.emailVerified).toBe(true)

    // Now the gated action succeeds.
    const ok = await api('POST', '/api/listings', {
      token: login.json.token,
      body: { name: 'ok', provider_type: 'NVIDIA', gpu_model: 'H200', region: 'EU' },
    })
    expect(ok.status).toBe(201)
  })

  it('verify is single-use: the same raw token cannot be reused', async () => {
    // Register, grab the raw token from the dev console log, consume it, replay.
    const { logs } = await registerRaw('buyer', 'singleuse@sg.test')
    const m = logs.join('\n').match(/VERIFY_TOKEN: \S+ (\S+)/)
    const raw = m && m[1]
    expect(raw).toBeTruthy()
    expect((await api('POST', '/api/auth/verify', { body: { token: raw } })).status).toBe(200)
    // Replay the same token -> invalid.
    expect((await api('POST', '/api/auth/verify', { body: { token: raw } })).status).toBe(400)
  })

  it('gates buyer deal-accept until verified', async () => {
    // Verified + unverified buyers, plus an active listing (via a verified seller).
    const seller = await registerVerified(api, { email: 'gateseller@sg.test', role: 'seller' })
    const listing = await api('POST', '/api/listings', {
      token: seller.json.token,
      body: { name: 'Acc', provider_type: 'AMD', gpu_model: 'MI300X', region: 'EU', count: 4 },
    })
    const op = await createSession(opId, 'operator', appPool)
    const listingId = listing.json.listing.id
    await api('PATCH', `/api/listings/${listingId}/status`, {
      token: op.token,
      body: { status: 'active' },
    })

    const unverified = (await registerRaw('buyer', 'unverifiedbuyer@sg.test')).out
    const denied = await api('POST', '/api/deals/accept', {
      token: unverified.json.token,
      body: { listingId },
    })
    expect(denied.status).toBe(403)
    expect(denied.json.error.code).toBe('email_unverified')

    const buyer = await registerVerified(api, { email: 'verifiedbuyer@sg.test', role: 'buyer' })
    const accepted = await api('POST', '/api/deals/accept', {
      token: buyer.json.token,
      body: { listingId },
    })
    expect(accepted.status).toBe(201)
  })

  it('resend issues a fresh token for an unverified account (always 200)', async () => {
    await api('POST', '/api/auth/register', {
      body: { email: 'resend@sg.test', password: 'supersecret123', role: 'buyer' },
    })
    const { logs } = await withCapturedInfo(() =>
      api('POST', '/api/auth/resend', { body: { email: 'resend@sg.test' } }),
    )
    expect(logs.join('\n')).toMatch(/VERIFY_TOKEN: resend@sg\.test \S+/)
    // Unknown email also returns 200 (no enumeration).
    expect((await api('POST', '/api/auth/resend', { body: { email: 'ghost@sg.test' } })).status).toBe(200)
  })
})

describe('password reset', () => {
  beforeAll(() => app.locals.resetAuthRateLimiters?.())

  it('reset-request always 200; reset changes password and kills old sessions', async () => {
    const reg = await api('POST', '/api/auth/register', {
      body: { email: 'resetme@sg.test', password: 'supersecret123', role: 'buyer' },
    })
    const oldToken = reg.json.token
    // Old session authenticates before the reset.
    expect((await api('GET', '/api/auth/me', { token: oldToken })).status).toBe(200)

    // Unknown email -> 200 with no token issued (no enumeration).
    expect(
      (await api('POST', '/api/auth/reset-request', { body: { email: 'nobody@sg.test' } })).status,
    ).toBe(200)

    const { logs } = await withCapturedInfo(() =>
      api('POST', '/api/auth/reset-request', { body: { email: 'resetme@sg.test' } }),
    )
    const m = logs.join('\n').match(/RESET_TOKEN: \S+ (\S+)/)
    expect(m).toBeTruthy()

    const reset = await api('POST', '/api/auth/reset', {
      body: { token: m[1], password: 'brandnewpass123' },
    })
    expect(reset.status).toBe(200)
    expect(reset.json.reset).toBe(true)

    // Old session is invalidated (logged out everywhere).
    expect((await api('GET', '/api/auth/me', { token: oldToken })).status).toBe(401)
    // Old password no longer works; new one does.
    expect(
      (await api('POST', '/api/auth/login', { body: { email: 'resetme@sg.test', password: 'supersecret123' } })).status,
    ).toBe(401)
    expect(
      (await api('POST', '/api/auth/login', { body: { email: 'resetme@sg.test', password: 'brandnewpass123' } })).status,
    ).toBe(200)
  })

  it('reset rejects an invalid/expired token with 400', async () => {
    const r = await api('POST', '/api/auth/reset', { body: { token: 'bogus', password: 'whatever123' } })
    expect(r.status).toBe(400)
    expect(r.json.error.code).toBe('invalid_token')
  })
})

describe('operator token hand-off', () => {
  let opToken

  beforeAll(async () => {
    app.locals.resetAuthRateLimiters?.()
    opToken = (await createSession(opId, 'operator', appPool)).token
  })

  it('list does NOT leak the token; reveal returns it once then 410, and audits', async () => {
    // A fresh unverified registration gives us a pending verification row.
    await api('POST', '/api/auth/register', {
      body: { email: 'handoff@sg.test', password: 'supersecret123', role: 'buyer' },
    })

    const list = await api('GET', '/api/operator/verifications', { token: opToken })
    expect(list.status).toBe(200)
    const pending = list.json.verifications.find((v) => v.email === 'handoff@sg.test')
    expect(pending).toBeTruthy()
    expect(pending).toHaveProperty('createdAt')
    expect(pending.token).toBeUndefined()
    expect(pending.tokenRaw).toBeUndefined()

    const reveal = await api('POST', `/api/operator/verifications/${pending.id}/reveal`, { token: opToken })
    expect(reveal.status).toBe(200)
    expect(typeof reveal.json.token).toBe('string')

    // Repeat reveal -> 410 Gone.
    const again = await api('POST', `/api/operator/verifications/${pending.id}/reveal`, { token: opToken })
    expect(again.status).toBe(410)

    // The revealed token actually works, and the reveal was audited.
    expect((await api('POST', '/api/auth/verify', { body: { token: reveal.json.token } })).status).toBe(200)
    const { rows: audit } = await withUser(opId, 'operator', async (c) =>
      c.query(`SELECT * FROM audit_log WHERE entity='email_verifications'`),
    appPool)
    expect(audit.length).toBeGreaterThanOrEqual(1)
    expect(audit[0].action).toBe('reveal')
  })

  it('rejects non-operator access to the hand-off endpoints', async () => {
    const buyer = await registerVerified(api, { email: 'notop@sg.test', role: 'buyer' })
    expect((await api('GET', '/api/operator/verifications', { token: buyer.json.token })).status).toBe(403)
    expect((await api('GET', '/api/operator/verifications')).status).toBe(401)
  })
})

describe('strict auth rate limits', () => {
  it('trips 429 on the 11th register within the window (fresh app)', async () => {
    const app2 = createApp({ pool: appPool })
    const server2 = await listenExpress(app2)
    const url2 = baseUrl(server2)
    try {
      for (let i = 0; i < 10; i++) {
        const r = await fetch(`${url2}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: `rr${i}@sg.test`, password: 'supersecret123', role: 'buyer' }),
        })
        expect(r.status).toBe(201)
      }
      const eleventh = await fetch(`${url2}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'rrx@sg.test', password: 'supersecret123', role: 'buyer' }),
      })
      expect(eleventh.status).toBe(429)
      expect(eleventh.headers.get('retry-after')).toBeTruthy()
    } finally {
      await new Promise((r) => server2.close(r))
    }
  })
})
