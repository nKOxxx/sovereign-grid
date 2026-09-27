// server/test/intel.test.js
// Wave L — market-observations backend: RLS/roles, public whitelist read model,
// operator POST, and the vast.ai ingest (fixture-based, NO live network).
//
// End-to-end against the real stack on a scratch DB (same harness as
// deal_accept.test.js). Verifies:
//   * operator POST -> row visible via the public GET; anon POST -> 401;
//     buyer/seller POST -> 403; the public GET exposes ONLY whitelisted
//     columns (no created_by leak).
//   * ingest with a stubbed fetchImpl returning the real captured fixture:
//     correct inserted count; a second run of the same fixture -> 0 inserted,
//     N updated (the (source, source_ref) dedupe holds); a consumer-only
//     payload -> 0 inserted.
//   * family-map sync: the JS map in intel.js and the SQL helper
//     family_for_accel() emit the SAME families for every allowlisted token,
//     and both match src/lib/deal.js `acceleratorFamily` (EXACT strings).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { migrate } from '../src/db/migrate.js'
import { createPool, withUser } from '../src/db/pool.js'
import { createApp } from '../src/app.js'
import { createSession } from '../src/auth/sessions.js'
import { createScratchDb, dropScratchDb } from './helpers/db.js'
import {
  createIntelRouter, familyForAccel, VAST_ALLOWLIST, VAST_ALLOWLIST_RE,
  AZURE_GPU_COUNTS, isAzureDedicatedLinuxPayg, acceleratorForAzureSku,
  regionForAzureRegion,
} from '../src/routes/intel.js'
import { acceleratorFamily } from '../../src/lib/deal.js'

// The captured fixture is loaded, never fetched, so tests need no network.
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/vast_sample.json', import.meta.url), 'utf8'),
)
const allowListed = fixture.offers.filter((o) => VAST_ALLOWLIST_RE.test(String(o.gpu_name || '')))

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
function mkStubFetch(payload) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  })
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

beforeAll(async () => {
  scratch = await createScratchDb()
  await migrate({ url: scratch.url, log: () => {} })
  appPool = createPool(scratch.appUrl)

  await withUser(opId, 'operator', async (c) => {
    await c.query(
      `INSERT INTO users (id, role, email, display_name)
       VALUES ($1,'operator',$2,'SG Intel Operator')`,
      [opId, 'intelop@sg.test'],
    )
  }, appPool)

  // createApp passes opts.fetchImpl down to the intel router. The main app is
  // bound to the captured fixture so ingest tests need no network.
  app = createApp({ pool: appPool, fetchImpl: mkStubFetch(fixture) })
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

describe('POST /api/intel/observations — RBAC + RLS', () => {
  let opToken
  let buyerToken
  let sellerToken

  beforeAll(async () => {
    opToken = (await createSession(opId, 'operator', appPool)).token
    buyerToken = (await register('buyer', 'intelbuyer@sg.test')).json.token
    sellerToken = (await register('seller', 'intelseller@sg.test')).json.token
  })

  const payload = {
    level: 'Quoted',
    accelerator: 'H200 SXM',
    price: 2.15,
    source: 'sg seller quote (test)',
  }

  it('anon POST -> 401', async () => {
    const res = await api('POST', '/api/intel/observations', { body: payload })
    expect(res.status).toBe(401)
    expect(res.json.error.code).toBe('unauthorized')
  })

  it('buyer POST -> 403; seller POST -> 403', async () => {
    for (const token of [buyerToken, sellerToken]) {
      const res = await api('POST', '/api/intel/observations', { token, body: payload })
      expect(res.status).toBe(403)
      expect(res.json.error.code).toBe('forbidden')
    }
  })

  it('operator POST -> 201 with a server-computed family', async () => {
    const res = await api('POST', '/api/intel/observations', { token: opToken, body: payload })
    expect(res.status).toBe(201)
    expect(res.json.observation.level).toBe('Quoted')
    expect(res.json.observation.family).toBe('H200') // acceleratorFamily('H200 SXM')
    expect(res.json.observation.region).toBe('Global') // default
    expect(res.json.observation.unit).toBe('usd/accel-hr')
  })

  it('operator POST -> region default and family for an unmapped accelerator', async () => {
    const res = await api('POST', '/api/intel/observations', {
      token: opToken,
      body: { ...payload, accelerator: 'TPU v7', region: 'GCC', price: 2.5 },
    })
    expect(res.status).toBe(201)
    expect(res.json.observation.family).toBe('TPU')
    expect(res.json.observation.region).toBe('GCC')
  })

  it('public GET exposes ONLY whitelisted columns (no created_by leak)', async () => {
    const res = await api('GET', '/api/intel/observations')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.json.observations)).toBe(true)
    expect(res.json.observations.length).toBeGreaterThan(0)
    const row = res.json.observations.find((o) => o.family === 'H200')
    expect(row).toBeTruthy()
    expect(row.level).toBe('Quoted')
    expect(row.price).toBe(2.15)
    expect(row).toHaveProperty('observed_at')
    expect(row).not.toHaveProperty('created_by') // operator identity never leaks
    // created_at is internal too; the public model exposes only the whitelist.
    for (const o of res.json.observations) {
      expect(o).not.toHaveProperty('created_by')
      expect(o).not.toHaveProperty('created_at')
    }
  })

  it('public GET is open — no auth required', async () => {
    const res = await api('GET', '/api/intel/observations')
    expect(res.status).toBe(200)
  })
})

describe('POST /api/intel/ingest/vast — fixture-based, dedupe, allowlist', () => {
  let opToken
  beforeAll(async () => {
    opToken = (await createSession(opId, 'operator', appPool)).token
  })

  it('ingests the fixture: correct inserted count, correct regions/prices', async () => {
    const res = await api('POST', '/api/intel/ingest/vast', {
      token: opToken,
      body: {}, // fetchImpl stub returns the fixture; body is ignored
    })
    // The captured fixture contains exactly the 4 datacenter-GPU offers.
    expect(allowListed.length).toBe(4)
    expect(res.status).toBe(200)
    expect(res.json.inserted).toBe(4)
    expect(res.json.updated).toBe(0)
    expect(res.json.skipped).toBe(fixture.offers.length - 4)

    const pub = await api('GET', '/api/intel/observations')
    const obs = pub.json.observations
    // 4 new Indicative vast.ai rows, distinct source_refs.
    const vast = obs.filter((o) => o.source === 'vast.ai')
    expect(vast.length).toBe(4)
    expect(new Set(vast.map((o) => o.source_ref)).size).toBe(4)
    expect(vast.every((o) => o.level === 'Indicative' && o.unit === 'usd/accel-hr')).toBe(true)
    // H200 (1 gpu, $1.9751) -> $1.9751/accel-hr, US region.
    const h200 = vast.find((o) => o.accelerator === 'H200')
    expect(h200.price).toBeCloseTo(1.975146198830409, 10)
    expect(h200.region).toBe('US')
    expect(h200.family).toBe('H200')
    // H100 SXM (3 gpu, $4.4022) -> $1.4674/accel-hr, France -> EU. Family is the
    // raw accelerator (lib acceleratorFamily has no H100 pattern -> passthrough).
    const h100sxm = vast.find((o) => o.accelerator === 'H100 SXM')
    expect(h100sxm.price).toBeCloseTo(4.402222222222223 / 3, 10)
    expect(h100sxm.region).toBe('EU')
    expect(h100sxm.family).toBe('H100') // taxonomy 0008: 'H100 SXM' -> 'H100'
  })

  it('second run of the SAME fixture -> 0 inserted, N updated (dedupe holds)', async () => {
    const res = await api('POST', '/api/intel/ingest/vast', { token: opToken, body: {} })
    expect(res.status).toBe(200)
    expect(res.json.inserted).toBe(0)
    expect(res.json.updated).toBe(4)
    expect(res.json.skipped).toBe(fixture.offers.length - 4)

    // No duplicate (source, source_ref) rows appear.
    const pub = await api('GET', '/api/intel/observations')
    const vast = pub.json.observations.filter((o) => o.source === 'vast.ai')
    expect(vast.length).toBe(4)
  })

  it('consumer-only payload -> 0 inserted, all skipped', async () => {
    // Spin a second app bound to a consumer-only stub (no allowlist matches).
    const consumerApp = createApp({
      pool: appPool,
      fetchImpl: mkStubFetch({
        offers: [
          { id: 9001, gpu_name: 'Tesla V100', num_gpus: 4, dph_total: 0.1088, geolocation: 'Washington, US' },
          { id: 9002, gpu_name: 'RTX 5090', num_gpus: 1, dph_total: 0.2688, geolocation: 'Spain, ES' },
        ],
      }),
    })
    const cSrv = await listenExpress(consumerApp)
    try {
      const cUrl = baseUrl(cSrv)
      const res = await fetch(`${cUrl}/api/intel/ingest/vast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
        body: '{}',
      })
      const json = await res.json()
      expect(json.inserted).toBe(0)
      expect(json.updated).toBe(0)
      expect(json.skipped).toBe(2)
    } finally {
      await new Promise((r) => cSrv.close(r))
    }
  })
})

describe('family-map sync (JS map == SQL helper == lib acceleratorFamily)', () => {
  let sqlFamily
  beforeAll(async () => {
    sqlFamily = async (accel) => {
      const { rows } = await appPool.query('SELECT family_for_accel($1) AS family', [accel])
      return rows[0].family
    }
  })

  it('emits the same family for every allowlisted token across all three', async () => {
    for (const token of VAST_ALLOWLIST) {
      const js = familyForAccel(token)
      const sql = await sqlFamily(token)
      const lib = acceleratorFamily(token)
      expect(js).toBe(sql)
      expect(js).toBe(lib)
    }
  })

  it('the JS map stays absent of invented labels — every allowlist family is one of the lib strings', async () => {
    const jsFamilies = new Set(VAST_ALLOWLIST.map((t) => familyForAccel(t)))
    const libFamilies = new Set(VAST_ALLOWLIST.map((t) => acceleratorFamily(t)))
    expect(jsFamilies).toEqual(libFamilies)
    // The allowlist emits no 'Hopper-class'-style invented grouping — families
    // are EXACT strings from lib (H100, H200, ..., MI300X, L40/L40S, ...).
    expect([...jsFamilies].every((f) => !/class/i.test(f))).toBe(true)
  })

  it('the SQL mapping honors the vast MI3xx capture path (MI325X -> MI300X)', async () => {
    expect(familyForAccel('MI325X')).toBe('MI300X')
    expect(await sqlFamily('MI325X')).toBe('MI300X')
  })

  it('createIntelRouter is exported for the app factory wiring', () => {
    expect(typeof createIntelRouter).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// Azure Retail Prices ingest — fixture captured live 2026-09-27
// (armSkuName eq 'Standard_NC40ads_H100_v5', unmodified). GPU counts in
// AZURE_GPU_COUNTS were verified against Microsoft Learn size-series docs the
// same day; see the comment block on the map in intel.js.
// ---------------------------------------------------------------------------
describe('POST /api/intel/ingest/azure — fixture-based, verified counts, dedupe', () => {
  let opToken
  let azUrl
  let azSrv
  const bySku = {}

  // The captured fixture is loaded at collection time (plain file read — no
  // network); the stubbed app is wired in beforeAll.
  bySku.Standard_NC40ads_H100_v5 = JSON.parse(
    readFileSync(new URL('./fixtures/azure_sample.json', import.meta.url), 'utf8'),
  )

  beforeAll(async () => {
    opToken = (await createSession(opId, 'operator', appPool)).token
    const azApp = createApp({ pool: appPool, fetchImpl: mkAzureStub(bySku) })
    azSrv = await listenExpress(azApp)
    azUrl = baseUrl(azSrv)
  })
  afterAll(async () => {
    await new Promise((r) => azSrv.close(r))
  })

  // URL-aware stub: the route issues one request per SKU in AZURE_GPU_COUNTS;
  // return the fixture only for the SKU it captured, empty pages otherwise.
  function mkAzureStub(map) {
    return async (url) => {
      const m = /armSkuName%20eq%20'([^']+)'/.exec(String(url))
      const sku = m ? m[1] : ''
      return { ok: true, status: 200, json: async () => map[sku] || { Items: [] } }
    }
  }

  const azureFixture = bySku.Standard_NC40ads_H100_v5
  const eligible = azureFixture.Items.filter(
    (r) => AZURE_GPU_COUNTS[r.armSkuName] && isAzureDedicatedLinuxPayg(r),
  )

  async function azApi(method, path, { token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${azUrl}${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    })
    return { status: res.status, json: await res.json() }
  }

  it('the captured fixture contains eligible rows (guard against silent drift)', () => {
    expect(azureFixture.Items.length).toBeGreaterThan(200)
    // NC40ads_H100_v5 = 1 GPU: every dedicated Linux PAYG row in the fixture
    // is priced as-is (price == retailPrice).
    expect(eligible.length).toBeGreaterThan(15)
    expect(eligible.every((r) => r.armSkuName === 'Standard_NC40ads_H100_v5')).toBe(true)
  })

  it('ingests the fixture: correct inserted count and a real uaenorth price', async () => {
    const res = await azApi('POST', '/api/intel/ingest/azure', { token: opToken })
    expect(res.status).toBe(200)
    expect(res.json.inserted).toBe(eligible.length)
    expect(res.json.updated).toBe(0)

    const pub = await api('GET', '/api/intel/observations')
    const az = pub.json.observations.filter((o) => o.source === 'azure')
    expect(az.length).toBe(eligible.length)
    expect(az.every((o) => o.level === 'Indicative' && o.unit === 'usd/accel-hr')).toBe(true)
    expect(az.every((o) => o.accelerator === 'H100' && o.family === 'H100')).toBe(true)

    // uaenorth -> GCC; NC40ads_H100_v5 is a 1-GPU VM so price passes through.
    const uae = eligible.find((r) => r.armRegionName === 'uaenorth')
    const uaeRow = az.find((o) => o.source_ref === `Standard_NC40ads_H100_v5:${uae.meterName}:uaenorth:Consumption`)
    expect(Number(uaeRow.price)).toBeCloseTo(Number(uae.retailPrice), 10)
    expect(uaeRow.region).toBe('GCC')
    // westeurope -> EU.
    const we = az.find((o) => o.region === 'EU')
    expect(we).toBeTruthy()
  })

  it('second run of the SAME fixture -> 0 inserted, N updated (dedupe holds)', async () => {
    const res = await azApi('POST', '/api/intel/ingest/azure', { token: opToken })
    expect(res.status).toBe(200)
    expect(res.json.inserted).toBe(0)
    expect(res.json.updated).toBe(eligible.length)
    const pub = await api('GET', '/api/intel/observations')
    expect(pub.json.observations.filter((o) => o.source === 'azure').length).toBe(eligible.length)
  })

  it('multi-GPU SKUs divide by the verified count; Windows/Spot/LowPri/DevTest/unknown skip', async () => {
    const synthetic = {
      Items: [
        // ND96isr_H200_v5 (8 GPUs, verified): dedicated Linux PAYG in westeurope.
        { armSkuName: 'Standard_ND96isr_H200_v5', skuName: 'Standard ND96isr H200 v5', meterName: 'ND96isr H200 v5', armRegionName: 'westeurope', retailPrice: 24.0, unitOfMeasure: '1 Hour', currencyCode: 'USD', type: 'Consumption', productName: 'Virtual Machines ND H200 v5 Series' },
        // Same SKU, but Windows rate -> skip.
        { armSkuName: 'Standard_ND96isr_H200_v5', skuName: 'Standard ND96isr H200 v5', meterName: 'ND96isr H200 v5 Windows', armRegionName: 'westeurope', retailPrice: 28.0, unitOfMeasure: '1 Hour', currencyCode: 'USD', type: 'Consumption', productName: 'Virtual Machines ND H200 v5 Series Windows' },
        // Spot -> skip.
        { armSkuName: 'Standard_ND96isr_H200_v5', skuName: 'ND96isr H200 v5 Spot', meterName: 'ND96isr H200 v5 Spot', armRegionName: 'westeurope', retailPrice: 9.0, unitOfMeasure: '1 Hour', currencyCode: 'USD', type: 'Consumption', productName: 'Virtual Machines ND H200 v5 Series' },
        // Unknown SKU (not in the verified map) -> skip even though the row is clean.
        { armSkuName: 'Standard_NC999ads_H999_v9', skuName: 'Standard NC999ads H999 v9', meterName: 'NC999ads H999 v9', armRegionName: 'eastus', retailPrice: 5.0, unitOfMeasure: '1 Hour', currencyCode: 'USD', type: 'Consumption', productName: 'Virtual Machines NCH999v9 Series' },
        // Reservation -> skip.
        { armSkuName: 'Standard_NC24ads_A100_v4', skuName: 'Standard NC24ads A100 v4', meterName: 'NC24ads A100 v4', armRegionName: 'eastus', retailPrice: 1.2, unitOfMeasure: '1 Hour', currencyCode: 'USD', type: 'Reservation', productName: 'Virtual Machines NC A100 v4 Series' },
      ],
    }
    const app2 = createApp({ pool: appPool, fetchImpl: mkAzureStub({ Standard_ND96isr_H200_v5: synthetic }) })
    const srv = await listenExpress(app2)
    try {
      const res = await fetch(`${baseUrl(srv)}/api/intel/ingest/azure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opToken}` },
        body: '{}',
      })
      const json = await res.json()
      expect(json.inserted).toBe(1) // only the clean H200 row
      expect(json.updated).toBe(0)
      expect(json.skipped).toBe(4)

      const pub = await api('GET', '/api/intel/observations')
      const h200 = pub.json.observations.find(
        (o) => o.source === 'azure' && o.accelerator === 'H200' && o.region === 'EU',
      )
      expect(Number(h200.price)).toBeCloseTo(24.0 / 8, 10) // $3.00/accel-hr
      expect(h200.family).toBe('H200')
      // The unknown SKU must have produced NO row.
      expect(pub.json.observations.some((o) => String(o.source_ref).includes('H999'))).toBe(false)
    } finally {
      await new Promise((r) => srv.close(r))
    }
  })

  it('unit guards: acceleratorForAzureSku + regionForAzureRegion', () => {
    expect(acceleratorForAzureSku('Standard_NC40ads_H100_v5')).toBe('H100')
    expect(acceleratorForAzureSku('Standard_ND96isr_MI300X_v5')).toBe('MI300X')
    expect(acceleratorForAzureSku('Standard_D4s_v5')).toBe(null)
    expect(regionForAzureRegion('uaenorth')).toBe('GCC')
    expect(regionForAzureRegion('westeurope')).toBe('EU')
    expect(regionForAzureRegion('switzerlandnorth')).toBe('EU')
    expect(regionForAzureRegion('eastus2')).toBe('US')
    expect(regionForAzureRegion('jioindiawest')).toBe('Asia')
    expect(regionForAzureRegion('australiaeast')).toBe('Global')
    expect(regionForAzureRegion('')).toBe('Global')
  })
})
