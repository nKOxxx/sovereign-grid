// server/test/wave_e.test.js
// WAVE E — server hardening / deploy-readiness.
//
// Covers:
//   * security headers on any response (nosniff, frame denial, referrer, CSP)
//   * CORS allow-list from env/defaults: known origin echoed, unknown -> none
//   * jsonb regression: bare-string field -> clean 400 with field path;
//     valid object/array jsonb -> 201
//   * /health (and /api/health) 200 unauthenticated
//   * body-limit overflow -> 413 payload_too_large
//   * env validation: missing required vars -> clear fatal message (validator
//     tested directly, since it only gates src/index.js boot, not createApp)

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import { migrate } from '../src/db/migrate.js'
import { createPool } from '../src/db/pool.js'
import { createApp } from '../src/app.js'
import { validateEnv } from '../src/env.js'
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

/** Raw HTTP helper so we can send arbitrary headers (Origin) fetch may strip. */
function rawRequest(method, path, { origin, body, token, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const { hostname, port } = new URL(url)
    const payload = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body)
    const req = http.request(
      {
        hostname,
        port,
        path,
        method,
        headers: {
          ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(origin ? { Origin: origin } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          let json = null
          try {
            json = data ? JSON.parse(data) : null
          } catch {
            json = null
          }
          resolve({ status: res.statusCode, headers: res.headers, json })
        })
      },
    )
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

async function api(method, path, { token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, json }
}

async function registerBuyer(email) {
  return api('POST', '/api/auth/register', {
    body: { email, password: 'supersecret123', role: 'buyer', displayName: 'Buyer' },
  })
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
  await dropScratchDb(scratch.dbName)
})

// ---------------------------------------------------------------------------
describe('security headers (WAVE E #1)', () => {
  it('every response carries the hardened header set', async () => {
    const r = await rawRequest('GET', '/health')
    expect(r.status).toBe(200)
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['x-frame-options']).toBe('DENY')
    expect(r.headers['referrer-policy']).toBe('no-referrer')
    expect(r.headers['content-security-policy']).toContain("default-src 'none'")
  })

  it('auth responses are never cached (Cache-Control: no-store)', async () => {
    const r = await rawRequest('POST', '/api/auth/login', {
      body: { email: 'nobody@sg.test', password: 'x' },
    })
    expect(r.status).toBe(401)
    expect(r.headers['cache-control']).toContain('no-store')
  })
})

// ---------------------------------------------------------------------------
describe('CORS allow-list (WAVE E #2)', () => {
  it('known origin gets its exact origin echoed back', async () => {
    const r = await rawRequest('GET', '/health', { origin: 'http://localhost:4173' })
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:4173')
  })

  it('unknown origin gets NO access-control-allow-origin header', async () => {
    const r = await rawRequest('GET', '/health', { origin: 'https://evil.example.com' })
    expect(r.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('preflight from a known origin succeeds with 204 + CORS headers', async () => {
    const r = await rawRequest('OPTIONS', '/api/requests', {
      origin: 'https://nkoxxx.github.io',
      headers: { 'Access-Control-Request-Method': 'POST' },
    })
    expect(r.status).toBe(204)
    expect(r.headers['access-control-allow-origin']).toBe('https://nkoxxx.github.io')
    expect(r.headers['access-control-allow-methods']).toContain('POST')
  })
})

// ---------------------------------------------------------------------------
describe('health probes (WAVE E #3)', () => {
  it('GET /health returns 200 {ok, uptime} with NO auth', async () => {
    const r = await rawRequest('GET', '/health')
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(typeof r.json.uptime).toBe('number')
    expect(r.headers['access-control-allow-origin']).toBeUndefined() // unauthenticated & not CORS-gated
  })

  it('GET /api/health is an alias', async () => {
    const r = await rawRequest('GET', '/api/health')
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('body limit (WAVE E #5)', () => {
  it('rejects an oversized body with 413 payload_too_large', async () => {
    const big = JSON.stringify({ padding: 'x'.repeat(300 * 1024) }) // ~300kb > 256kb cap
    const r = await rawRequest('POST', '/health', { body: big })
    expect(r.status).toBe(413)
    expect(r.json.error.code).toBe('payload_too_large')
  })
})

// ---------------------------------------------------------------------------
describe('jsonb regression fix (WAVE E known bug)', () => {
  let buyer

  beforeAll(async () => {
    buyer = (await registerBuyer(`wavee-${randomUUID()}@sg.test`)).json
  })

  it.each([
    'workload',
    'location',
    'resilience',
    'compliance',
    'options',
    'budget',
    'privacy',
  ])('bare-string %s -> 400 validation_failed with that field path', async (field) => {
    const r = await api('POST', '/api/requests', {
      token: buyer.token,
      body: { name: 'bad jsonb', [field]: 'failover' },
    })
    expect(r.status).toBe(400)
    expect(r.json.error.code).toBe('validation_failed')
    // hub-found bug: a bare string must not reach Postgres and 500
    expect(r.json.error.details.some((d) => d.field === field)).toBe(true)
  })

  it('number scalar jsonb -> 400 (not just strings)', async () => {
    const r = await api('POST', '/api/requests', {
      token: buyer.token,
      body: { name: 'bad jsonb', resilience: 42 },
    })
    expect(r.status).toBe(400)
    expect(r.json.error.code).toBe('validation_failed')
  })

  it('valid object jsonb still creates the request (201)', async () => {
    const r = await api('POST', '/api/requests', {
      token: buyer.token,
      body: {
        name: 'good jsonb',
        workload: { gpu: 'H100', count: 8 },
        location: { region: 'EU', country: 'IS' },
        resilience: { tier: 'tier3', failover: true },
        compliance: { framework: ['ISO27001'] },
        options: ['spot'],
        budget: { maxPerGpuHr: 2.5 },
        privacy: { level: 'high' },
      },
    })
    expect(r.status).toBe(201)
    expect(r.json.request.name).toBe('good jsonb')
    expect(r.json.request.workload.gpu).toBe('H100')
  })

  it('null jsonb is accepted', async () => {
    const r = await api('POST', '/api/requests', {
      token: buyer.token,
      body: { name: 'null jsonb', resilience: null },
    })
    expect(r.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
describe('env validation (WAVE E #4, validator under test)', () => {
  it('reports both DATABASE_URL and PORT when both are missing', () => {
    const missing = validateEnv({})
    expect(missing.length).toBe(2)
    expect(missing.join(' ')).toMatch(/DATABASE_URL/)
    expect(missing.join(' ')).toMatch(/PORT/)
  })

  it('accepts DATABASE_URL + PORT', () => {
    expect(validateEnv({ DATABASE_URL: 'postgresql://x', PORT: '8787' })).toEqual([])
  })

  it('accepts a PG* fallback in place of DATABASE_URL', () => {
    expect(validateEnv({ PGHOST: '/tmp', PORT: '8787' })).toEqual([])
  })

  it('flags PORT missing even when DB config is present', () => {
    const missing = validateEnv({ DATABASE_URL: 'postgresql://x' })
    expect(missing).toEqual(['PORT'])
  })

  it('SESSION_TTL_DAYS is not required (has a default)', () => {
    const missing = validateEnv({ DATABASE_URL: 'postgresql://x', PORT: '8787' })
    expect(missing).toEqual([])
  })
})
