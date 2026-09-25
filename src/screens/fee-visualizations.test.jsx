// src/screens/fee-visualizations.test.jsx
// Wave G2 — Fee Engine Recharts layer. Two layers are exercised:
//   1. PURE builders (buildSensitivitySeries / buildFeeFlow / buildPartnerSplit
//      / buildEffectiveRate) run real domain math (computeFees, computeCalculator,
//      partnerSplit) — asserted against the hand-derived §9.2 formulas.
//   2. React chart components render in the node/SSR env with Recharts mocked
//      (like ogl / canvas libs) — we assert the figures render their SG shell
//      and that the REAL computed series is actually wired into the chart.
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { computeFees, partnerSplit, feeAmount } from '../lib/fees.js'
import { computeCalculator } from '../lib/cost.js'

// Recharts is a canvas/DOM-adjacent lib: mock it so the chart components are
// testable in the node env (same pattern as the ogl stub in wave-g.test.jsx).
// The chart mock renders the `data` prop as JSON so tests can assert that the
// real domain-computed series actually reaches the chart.
vi.mock('recharts', async () => {
  const React = await import('react')
  const h = React.createElement
  const Chart = (props) =>
    h(
      'div',
      { 'data-rc': 'chart' },
      h('div', { 'data-rc-data': '1' }, JSON.stringify(props.data || [])),
      props.children || null,
    )
  const Null = () => null
  return {
    ResponsiveContainer: ({ children }) => h('div', { 'data-rc': 'resp' }, children),
    LineChart: Chart,
    BarChart: Chart,
    AreaChart: Chart,
    Line: Null,
    Bar: Null,
    Cell: Null,
    XAxis: Null,
    YAxis: Null,
    CartesianGrid: Null,
    Legend: Null,
    Tooltip: Null,
  }
})

import {
  buildSensitivitySeries,
  buildFeeFlow,
  buildPartnerSplit,
  buildEffectiveRate,
  FeeSensitivityChart,
  FeeFlowBreakdown,
  PartnerSplitView,
} from './FeeVisualizations.jsx'

// Default listing — Nordic H200 (src/data/seed.js): committed 2.15, on-demand 3.1, count 300.
const NORDIC = { committedPerAccelHr: 2.15, onDemandPerAccelHr: 3.1, count: 300 }
const BASE_ARGS = { sellerBase: 2.15, passthrough: 0.1, platformFee: 0.08, feeBasis: 'pct', feePayer: 'buyer', splitPct: 50, taxRate: 0.05 }

describe('buildSensitivitySeries — committed vs effective as fee slides 0→20%', () => {
  it('returns 21 rows across the 0–20% sweep with committed flat = seller base', () => {
    const rows = buildSensitivitySeries({ sellerBase: 2.15, passthrough: 0.1, feePayer: 'buyer', splitPct: 50, taxRate: 0.05 })
    expect(rows).toHaveLength(21)
    expect(rows[0].feePct).toBe(0)
    expect(rows[20].feePct).toBe(20)
    rows.forEach((r) => expect(r.committed).toBeCloseTo(2.15, 6))
  })

  it('effective at 0% = (base + passthrough) × (1 + tax), no fee', () => {
    const rows = buildSensitivitySeries({ sellerBase: 2.15, passthrough: 0.1, feePayer: 'buyer', splitPct: 50, taxRate: 0.05 })
    expect(rows[0].effective).toBeCloseTo((2.15 + 0.1) * 1.05, 5)
  })

  it('effective at 20% matches computeFees buyerPrice exactly (no hardcoded numbers)', () => {
    const rows = buildSensitivitySeries({ sellerBase: 2.15, passthrough: 0.1, feePayer: 'buyer', splitPct: 50, taxRate: 0.05 })
    const expected = computeFees({ sellerBase: 2.15, passthrough: 0.1, platformFee: 0.2, feeBasis: 'pct', feePayer: 'buyer', splitPct: 50, taxRate: 0.05 }).buyerPrice
    expect(rows[20].effective).toBeCloseTo(expected, 6)
  })
})

describe('buildFeeFlow — seller price → buyer price waterfall', () => {
  it('buyer price = seller base + passthrough + buyer-paid fee + tax', () => {
    const flow = buildFeeFlow(BASE_ARGS)
    const fee = feeAmount({ sellerBase: 2.15, platformFee: 0.08, feeBasis: 'pct' })
    const buyerFee = fee // feePayer === 'buyer' -> buyer pays full fee
    const preTax = 2.15 + 0.1 + buyerFee
    expect(flow.buyerFee).toBeCloseTo(buyerFee, 6)
    expect(flow.tax).toBeCloseTo(preTax * 0.05, 6)
    expect(flow.buyerPrice).toBeCloseTo(preTax * 1.05, 5)
    expect(flow.sellerPayout).toBeCloseTo(2.15, 6) // seller pays nothing
  })

  it('last waterfall segment is the buyer price total and sums are consistent', () => {
    const flow = buildFeeFlow(BASE_ARGS)
    const last = flow.segments[flow.segments.length - 1]
    expect(last.key).toBe('buyer')
    expect(last.value).toBeCloseTo(flow.buyerPrice, 6)
    // first visible segment is the seller price base from zero
    expect(flow.segments[0].key).toBe('seller')
    expect(flow.segments[0].base).toBe(0)
    expect(flow.segments[0].value).toBeCloseTo(2.15, 6)
  })

  it('split payer: buyer pays splitPct% of the fee, seller the rest', () => {
    const flow = buildFeeFlow({ ...BASE_ARGS, feePayer: 'split', splitPct: 60 })
    const fee = feeAmount({ sellerBase: 2.15, platformFee: 0.08, feeBasis: 'pct' })
    expect(flow.buyerFee).toBeCloseTo(fee * 0.6, 6)
    expect(flow.sellerFee).toBeCloseTo(fee * 0.4, 6)
    expect(flow.sellerPayout).toBeCloseTo(2.15 - fee * 0.4, 6)
  })
})

describe('buildPartnerSplit — §22.1 attribution', () => {
  it('platform + partner sum to gross and reflect the split pct', () => {
    const split = buildPartnerSplit({ platformGross: 0.172, partnerSplitPct: 30 })
    const expected = partnerSplit({ platformGross: 0.172, partnerSplitPct: 30 })
    expect(split.partner).toBeCloseTo(expected.partner, 6)
    expect(split.platform).toBeCloseTo(expected.platform, 6)
    expect(split.platform + split.partner).toBeCloseTo(0.172, 6)
    expect(split.partnerPct).toBeCloseTo(30, 6)
    expect(split.platformPct).toBeCloseTo(70, 6)
  })
})

describe('buildEffectiveRate — computeCalculator bridge', () => {
  it('returns the effective $/accel-hr at the reference utilization', () => {
    const rate = buildEffectiveRate({ count: NORDIC.count, pricePerAccelHr: NORDIC.committedPerAccelHr, onDemandPerAccelHr: NORDIC.onDemandPerAccelHr })
    const expected = computeCalculator({ count: 300, pricePerAccelHr: 2.15, onDemandPerAccelHr: 3.1, utilization: 0.6, termYears: 1 }).effectivePerAccelHr
    expect(rate).toBeCloseTo(expected, 6)
    expect(rate).toBeGreaterThan(2.15) // reservation spread over <100% utilization raises it
  })
})

describe('FeeSensitivityChart (Recharts mocked)', () => {
  it('renders the SG figure shell and wires the real computed series into the chart', () => {
    const rows = buildSensitivitySeries({ sellerBase: 2.15, passthrough: 0.1, feePayer: 'buyer', splitPct: 50, taxRate: 0.05 })
    const html = renderToStaticMarkup(<FeeSensitivityChart rows={rows} />)
    expect(html).toContain('data-testid="fee-sensitivity-chart"')
    expect(html).toContain('Fee sensitivity')
    // the mock renders the series JSON — prove the real numbers reach Recharts
    // (renderToStaticMarkup HTML-escapes the inner double quotes as &quot;)
    expect(html).toContain('&quot;feePct&quot;:20')
    expect(html).toContain('&quot;committed&quot;:2.15')
    // effective at 20% = (2.15+0.1+0.43)*1.05 = 2.814, through the data wire
    expect(html).toContain('&quot;effective&quot;:2.814')
  })
})

describe('FeeFlowBreakdown (Recharts mocked)', () => {
  it('renders the figure and passes the waterfall segments (buyer total) to the chart', () => {
    const flow = buildFeeFlow(BASE_ARGS)
    const html = renderToStaticMarkup(<FeeFlowBreakdown flow={flow} effectivePerAccelHr={3.58} />)
    expect(html).toContain('data-testid="fee-flow-chart"')
    expect(html).toContain('Fee flow')
    expect(html).toContain('3.58') // effective rate surfaced in the caption
    // the buyer total segment (key=buyer, value=buyerPrice) flows into the chart data
    expect(html).toContain('&quot;key&quot;:&quot;buyer&quot;')
    expect(html).toContain('&quot;value&quot;:2.5431') // buyer price raw float, substring-matched
  })
})

describe('PartnerSplitView (segmented bar)', () => {
  it('renders the segmented bar with platform vs partner widths ($-derived, not hardcoded)', () => {
    const split = buildPartnerSplit({ platformGross: 0.172, partnerSplitPct: 30 })
    const html = renderToStaticMarkup(<PartnerSplitView split={split} />)
    expect(html).toContain('data-testid="partner-split-view"')
    expect(html).toContain('Partner split')
    expect(html).toContain('data-testid="partner-platform-seg"')
    expect(html).toContain('data-testid="partner-partner-seg"')
    expect(html).toContain('width:70%') // platform net = 70%
    expect(html).toContain('width:30%') // partner share = 30%
  })
})
