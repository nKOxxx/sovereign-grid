// @vitest-environment happy-dom
// src/screens/market-intel.test.jsx
// Wave L — Market Intel live-vs-fallback coverage + design-law guard.
//
// Runs in the happy-dom environment (per-file override) so the component's
// mount effect actually fires and we can exercise both data branches by
// mocking global fetch:
//   * fetch returns rows  -> renders the live badge ("Live — vast.ai + curated")
//     and the live families/prices, and does NOT show the demo badge.
//   * fetch fails/empty   -> falls back to seed data and keeps the illustrative
//     DemoBadge.
// Plus the whole-app dark design-law guard (zero native <select>, zero light
// Tailwind classes, sg-num / sg-card / sg-display present) via
// renderToStaticMarkup, and node-safe unit tests of the mapping helpers.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import MarketIntel from './MarketIntel.jsx'
import { fetchObservations, liveToObservation, formatObservationDate } from '../lib/marketIntel.js'

const LIGHT_SLOP =
  /bg-white|bg-slate-\d|text-slate-\d|text-amber-\d|bg-amber-\d|text-emerald-\d|bg-emerald-\d|text-rose-\d|bg-rose-\d|border-slate-\d|border-amber-\d|border-emerald-\d|border-rose-\d|border-sky-\d|bg-sky-\d|accent-sky-\d/

const LIVE_JSON = {
  observations: [
    { id: 'a', level: 'Indicative', accelerator: 'H100 SXM', family: 'H100 SXM', region: 'EU', price: 1.4674, unit: 'usd/accel-hr', source: 'vast.ai', source_ref: '33017577', observed_at: '2026-09-26T10:00:00Z' },
    { id: 'b', level: 'Indicative', accelerator: 'H200', family: 'H200', region: 'US', price: 1.9751, unit: 'usd/accel-hr', source: 'vast.ai', source_ref: '49995691', observed_at: '2026-09-26T09:30:00Z' },
  ],
}

let consoleError
beforeEach(() => {
  document.body.innerHTML = ''
  globalThis.fetch = vi.fn()
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  consoleError.mockRestore()
})

async function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MarketIntel />)
  })
  // Flush the mount effect + the async fetch resolution.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  return container
}

describe('MarketIntel — live vs seed fallback (mount effect)', () => {
  it('renders live observations + the "Live — vast.ai + curated" badge when fetch returns rows', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => LIVE_JSON })
    const container = await mount()
    const html = container.innerHTML
    expect(html).toContain('Live — vast.ai + curated')
    expect(html).not.toContain('DEMO DATA')
    // live families + sg-num prices rendered
    expect(html).toContain('H200')
    expect(html).toContain('H100 SXM')
    expect(html).toContain('1.98') // H200 price $1.9751 -> toFixed(2)
    expect(html).toContain('sg-num')
    // observed_at surfaced as a dated timestamp
    expect(html).toContain('2026-09-26')
  })

  it('falls back to seed data + illustrative badge when the fetch fails', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const container = await mount()
    const html = container.innerHTML
    expect(html).toContain('DEMO DATA')
    expect(html).not.toContain('Live — vast.ai')
    // seed demo families still render (e.g. the seed H200 cell)
    expect(html.toLowerCase()).toContain('h200')
  })

  it('keeps the seed fallback + demo badge when the API returns an empty payload', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ observations: [] }) })
    const container = await mount()
    expect(container.innerHTML).toContain('DEMO DATA')
    expect(container.innerHTML).not.toContain('Live — vast.ai')
  })
})

describe('MarketIntel — design-law guard (dark tokens only)', () => {
  it('renders zero native <select> and zero light-theme Tailwind classes', () => {
    const html = renderToStaticMarkup(<MarketIntel />)
    expect(html.match(/<select\b/g) || []).toHaveLength(0)
    expect(html.match(LIGHT_SLOP) || []).toHaveLength(0)
    expect(html).toContain('role="combobox"')
  })

  it('carries the dark house tells (sg-card / sg-display / sg-num)', () => {
    const html = renderToStaticMarkup(<MarketIntel />)
    expect(html).toContain('sg-card')
    expect(html).toContain('sg-display')
    expect(html).toContain('sg-num')
  })
})

describe('MarketIntel — mapping helpers (pure)', () => {
  it('liveToObservation maps a backend row into the groupMarket shape', () => {
    const o = liveToObservation(LIVE_JSON.observations[0])
    expect(o.level).toBe('Indicative')
    expect(o.family).toBe('H100 SXM')
    expect(o.region).toBe('EU')
    expect(o.pricePerAccelHr).toBe(1.4674)
    expect(o.date).toBe('2026-09-26')
    expect(o.source).toContain('vast.ai')
    expect(o.source).toContain('#33017577')
  })

  it('formatObservationDate handles ISO and garbage inputs', () => {
    expect(formatObservationDate('2026-09-26T10:00:00Z')).toBe('2026-09-26')
    expect(formatObservationDate(null)).toBe('—')
    expect(formatObservationDate('bogus')).toBe('—')
  })

  it('fetchObservations returns mapped rows on success, null on failure/empty', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => LIVE_JSON })
    const rows = await fetchObservations()
    expect(rows).toHaveLength(2)

    globalThis.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    expect(await fetchObservations()).toBeNull()

    globalThis.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ observations: [] }) })
    expect(await fetchObservations()).toBeNull()

    globalThis.fetch.mockRejectedValue(new Error('offline'))
    expect(await fetchObservations()).toBeNull()
  })
})
