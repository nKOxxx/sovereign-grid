// src/screens/wave-g.test.jsx
// Wave G visual redesign — render-level tests (node env, react-dom/server).
// Covers: both target screens render with seed data, zero native <select>
// elements, Aurora renders without crashing (ogl mocked), the #1 match card
// carries the border-beam class, and the custom Select's SSR contract.
import { describe, it, expect, vi } from 'vitest'

// The Aurora layer imports ogl (WebGL); in the node test env we stub it so the
// component module loads without a GL backend. (Rendering is SSR-only here —
// the WebGL effect never runs.)
vi.mock('ogl', () => {
  class Color {
    constructor() {
      this.r = 0
      this.g = 0
      this.b = 0
    }
  }
  return {
    Renderer: class {
      constructor() {
        this.gl = null
      }
    },
    Program: class {},
    Mesh: class {},
    Triangle: class {},
    Color,
  }
})

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { MarketProvider } from '../store/MarketContext.jsx'
import MarketplaceHome from './MarketplaceHome.jsx'
import MatchResults from './MatchResults.jsx'
import Aurora from '../components/Aurora.jsx'
import Select from '../components/Select.jsx'

// Screens include <Link>s, so they must render inside a Router context.
const wrap = (el) => (
  <MemoryRouter>
    <MarketProvider>{el}</MarketProvider>
  </MemoryRouter>
)

const nativeSelects = (html) => (html.match(/<select\b/g) || []).length

describe('Wave G — MarketplaceHome', () => {
  it('renders with seed data (offline fallback path)', () => {
    const html = renderToStaticMarkup(wrap(<MarketplaceHome />))
    expect(html).toContain('Marketplace')
    expect(html).toContain('Nordic H200') // seed supply listing present
    expect(html).toContain('Shenhua Ascend 910C') // China supply present (D15)
  })

  it('renders zero native <select> elements', () => {
    const html = renderToStaticMarkup(wrap(<MarketplaceHome />))
    expect(nativeSelects(html)).toBe(0)
  })

  it('renders three custom popover-based Select filters', () => {
    const html = renderToStaticMarkup(wrap(<MarketplaceHome />))
    expect((html.match(/role="combobox"/g) || []).length).toBe(3)
    expect(html).not.toContain('<select')
    expect(html).toContain('popover="auto"')
  })

  it('renders the KPI strip with aggregates derived from seed data', () => {
    const html = renderToStaticMarkup(wrap(<MarketplaceHome />))
    expect(html).toContain('Supply listings')
    expect(html).toContain('Total accelerators')
    expect(html).toContain('Committed price floor')
    expect(html).toContain('Committed price ceiling')
    expect(html).toContain('$1.70') // min committed price (Ascend 910C)
    expect(html).toContain('$2.50') // max committed price (TPU v7 spot)
  })

  it('renders a dark canvas with the Aurora hero behind a display headline', () => {
    const html = renderToStaticMarkup(wrap(<MarketplaceHome />))
    expect(html).toContain('sg-mkt')
    expect(html).toContain('bg-canvas')
    expect(html).toContain('sg-hero')
    expect(html).toContain('sg-aurora')
    expect(html).toContain('sg-display')
  })

  it('keeps the offline badge + demo-note hooks', () => {
    const html = renderToStaticMarkup(wrap(<MarketplaceHome />))
    expect(html.toLowerCase()).toContain('illustrative data')
  })
})

describe('Wave G — MatchResults', () => {
  it('renders bookable match cards from seed data', () => {
    const html = renderToStaticMarkup(wrap(<MatchResults />))
    expect(html).toContain('Match Results')
    expect(html).toContain('Bookable offers')
    expect(html).toContain('Nordic H200')
  })

  it('renders zero native <select> elements', () => {
    const html = renderToStaticMarkup(wrap(<MatchResults />))
    expect(nativeSelects(html)).toBe(0)
  })

  it('shows >=3 offers including a non-NVIDIA one and Sovereignty/Power/Resilience', () => {
    const html = renderToStaticMarkup(wrap(<MatchResults />))
    const nvidia = (html.match(/H200|B200|GB200/g) || []).length
    const nonNvidia = (html.match(/MI300X|TPU|Ascend/g) || []).length
    expect(nvidia + nonNvidia).toBeGreaterThanOrEqual(3)
    expect(nonNvidia).toBeGreaterThanOrEqual(1)
    const lower = html.toLowerCase()
    ;['sovereignty', 'power', 'resilience'].forEach((w) => {
      expect(lower).toContain(w)
    })
  })

  it('preserves the golden seed scores 93 / 90 / 87', () => {
    const html = renderToStaticMarkup(wrap(<MatchResults />))
    ;['93', '90', '87'].forEach((s) => {
      expect(html).toContain(s)
    })
  })

  it('marks the highest-score (#1) match card with the border-beam class + BEST MATCH', () => {
    const html = renderToStaticMarkup(wrap(<MatchResults />))
    expect(html.indexOf('BEST MATCH')).toBeGreaterThan(-1)
    expect(html).toContain('sg-beam')
    expect(html).toContain('sg-card--best')
  })
})

describe('Wave G — Aurora', () => {
  it('renders in node env without crashing (ogl mocked)', () => {
    const html = renderToStaticMarkup(<Aurora />)
    expect(html.trim().startsWith('<div')).toBe(true)
  })

  it('is aria-hidden decorative layer', () => {
    const html = renderToStaticMarkup(<Aurora className="sg-aurora" />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('sg-aurora')
  })
})

describe('Wave G — Select SSR contract', () => {
  it('renders the native-popover + listbox a11y contract', () => {
    const html = renderToStaticMarkup(
      <Select value="EU" onChange={() => {}} options={['All regions', 'EU', 'US']} label="Region" />,
    )
    expect(html).toContain('popover="auto"')
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).toContain('role="listbox"')
  })

  it('flags the selected option with aria-selected=true', () => {
    const html = renderToStaticMarkup(
      <Select value="EU" onChange={() => {}} options={['All regions', 'EU', 'US']} label="Region" />,
    )
    expect(html).toMatch(/data-value="EU"[^>]*aria-selected="true"|aria-selected="true"[^>]*data-value="EU"/)
  })
})
