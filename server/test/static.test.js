// server/test/static.test.js
// Single-process deploy mode: when SG_STATIC_DIR points at a directory with an
// index.html, the app serves static assets + SPA fallback while /api keeps
// JSON 404s. Opt-in — without the env var the app is API-only (dev/test/CI and
// Pages behavior stays byte-identical). No DB needed: these paths never touch
// the pool, so a stub pool object is enough.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.js'

let staticRoot
let app
let server
let url

beforeAll(() => {
  staticRoot = mkdtempSync(join(tmpdir(), 'sg-static-'))
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><html><body>sg-spa</body></html>')
  mkdirSync(join(staticRoot, 'assets'))
  writeFileSync(join(staticRoot, 'assets', 'app.js'), 'console.log("sg-bundle")')

  process.env.SG_STATIC_DIR = staticRoot
  app = createApp({ pool: {} })
  server = app.listen(0)
  url = `http://127.0.0.1:${server.address().port}`
})

afterAll(() => {
  delete process.env.SG_STATIC_DIR
  server?.close()
  rmSync(staticRoot, { recursive: true, force: true })
})

describe('SG_STATIC_DIR single-process deploy mode', () => {
  it('serves static assets by exact path', async () => {
    const res = await fetch(`${url}/assets/app.js`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('sg-bundle')
  })

  it('falls back to index.html for SPA client routes', async () => {
    const res = await fetch(`${url}/matches`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('sg-spa')
  })

  it('keeps JSON 404 for unknown /api routes (no HTML leak into the API)', async () => {
    const res = await fetch(`${url}/api/definitely-not-a-route`)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe('not_found')
  })

  it('stays API-only when SG_STATIC_DIR is unset', async () => {
    delete process.env.SG_STATIC_DIR
    const app2 = createApp({ pool: {} })
    const server2 = app2.listen(0)
    try {
      const res = await fetch(`http://127.0.0.1:${server2.address().port}/matches`)
      expect(res.status).toBe(404)
      expect((await res.json()).error.code).toBe('not_found')
    } finally {
      server2.close()
    }
  })
})
