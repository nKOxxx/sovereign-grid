// src/screens/FeeVisualizations.jsx — Wave G2 Recharts layer for the Fee Engine.
//
// Three visualizations, all driven by the REAL domain functions (no hardcoded
// numbers):
//   computeFees / feeAmount / partnerSplit   <- ../lib/fees.js
//   computeCalculator.effectivePerAccelHr    <- ../lib/cost.js
//
// Pure builder functions are exported so they can be unit-tested directly in
// node; the React components wrap them in Recharts, styled with the Sovereign
// Grid design tokens (.sg-card, .sg-num, ...). Every figure carries a
// data-testid hook for the e2e sweep (additive only — existing contracts are
// untouched).
import { computeFees, feeAmount, partnerSplit } from '../lib/fees.js'
import { computeCalculator } from '../lib/cost.js'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import './fee-visualizations.css'

const d2 = (n) => '$' + Number(n).toFixed(2)
const d3 = (n) => '$' + Number(n).toFixed(3)
const pct = (n) => Number(n).toFixed(1) + '%'

// ---------------------------------------------------------------------------
// PURE builders — real domain math only.
// ---------------------------------------------------------------------------

/**
 * Fee sensitivity: committed (seller) vs effective (buyer) $/accel-hr as the
 * platform fee slides 0% → 20% (pct basis). Each row is computed through
 * computeFees so buyer/committed reflect passthrough, tax and payer config.
 */
export function buildSensitivitySeries({ sellerBase, passthrough = 0, feePayer = 'buyer', splitPct = 50, taxRate = 0, min = 0, max = 20, steps = 21 }) {
  const rows = []
  for (let i = 0; i < steps; i += 1) {
    const raw = min + ((max - min) * i) / (steps - 1)
    const feePct = Math.round(raw * 10) / 10
    const f = computeFees({ sellerBase, passthrough, platformFee: feePct / 100, feeBasis: 'pct', feePayer, splitPct, taxRate })
    rows.push({ feePct, committed: sellerBase, effective: f.buyerPrice })
  }
  return rows
}

/**
 * Fee flow waterfall segments for one quote: seller price → (+pass-through)
 * → (+buyer fee) → (+tax) → buyer price total. Each segment carries an
 * invisible `base` offset + a visible `value`, so the stacked Recharts bars
 * reproduce the canonical waterfall shape. Buyer-paid fee is derived from the
 * payer/split config via feeAmount — no hardcoded arithmetic.
 */
export function buildFeeFlow({ sellerBase, passthrough = 0, platformFee, feeBasis = 'pct', feePayer = 'buyer', splitPct = 50, taxRate = 0 }) {
  const fee = feeAmount({ sellerBase, platformFee, feeBasis })
  let buyerFee = 0
  let sellerFee = 0
  if (feePayer === 'buyer') buyerFee = fee
  else if (feePayer === 'seller') sellerFee = fee
  else {
    const share = Math.min(100, Math.max(0, splitPct)) / 100
    buyerFee = fee * share
    sellerFee = fee * (1 - share)
  }
  const preTax = sellerBase + passthrough + buyerFee
  const tax = preTax * taxRate
  const buyerPrice = preTax + tax
  const sellerPayout = Math.max(0, sellerBase - sellerFee)

  const segments = [
    { key: 'seller', label: 'Seller price', base: 0, value: sellerBase, color: '#8a8f98' },
    { key: 'passthrough', label: 'Pass-through', base: sellerBase, value: passthrough, color: '#3e8bff' },
    { key: 'buyerFee', label: 'Buyer fee', base: sellerBase + passthrough, value: buyerFee, color: '#3e8bff' },
    { key: 'tax', label: 'Tax', base: sellerBase + passthrough + buyerFee, value: tax, color: '#3e8bff' },
    { key: 'buyer', label: 'Buyer price', base: 0, value: buyerPrice, color: '#10b981' },
  ]
  // Collapse zero-valued segments so the chart stays 1:1 with what's real.
  const visible = segments.filter((s) => Math.round(s.value * 1000) !== 0)

  return { fee, buyerFee, sellerFee, tax, buyerPrice, sellerPayout, segments: visible }
}

/**
 * §22.1 partner attribution: platform gross revenue split between the partner
 * share (partnerSplitPct) and the platform's own net. Pure partnerSplit.
 */
export function buildPartnerSplit({ platformGross, partnerSplitPct = 0 }) {
  const { partner, platform } = partnerSplit({ platformGross, partnerSplitPct })
  const total = platformGross
  return {
    platformGross: total,
    partner,
    platform,
    partnerPct: total > 0 ? (partner / total) * 100 : 0,
    platformPct: total > 0 ? (platform / total) * 100 : 0,
  }
}

/**
 * Effective $/accel-hr for the default listing at the reference utilization,
 * via computeCalculator — keeps the fee-flow figure consistent with the
 * five-year calculator.
 */
export function buildEffectiveRate({ count, pricePerAccelHr, onDemandPerAccelHr, utilization = 0.6 }) {
  return computeCalculator({ count, pricePerAccelHr, onDemandPerAccelHr, utilization, termYears: 1 }).effectivePerAccelHr
}

// ---------------------------------------------------------------------------
// React components
// ---------------------------------------------------------------------------

const FIG_CAPTION = 'mb-3'
const FIG_TITLE = 'sg-fig__title'
const FIG_SUB = 'sg-fig__sub'

export function FeeSensitivityChart({ rows }) {
  return (
    <figure className="sg-card p-4" data-testid="fee-sensitivity-chart">
      <figcaption className={FIG_CAPTION}>
        <div className={FIG_TITLE}>Fee sensitivity</div>
        <div className={FIG_SUB}>committed vs effective $/accel-hr as the fee slides 0–20%</div>
      </figcaption>
      <ResponsiveContainer width="100%" height={220} aria-label="Fee sensitivity chart">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="rgba(255, 255, 255, 0.06)" vertical={false} />
          <XAxis dataKey="feePct" tickFormatter={(v) => `${v}%`} stroke="#62666d" tickLine={false} axisLine={false} tick={{ fill: '#8a8f98', fontSize: 11 }} />
          <YAxis tickFormatter={d2} stroke="#62666d" tickLine={false} axisLine={false} width={56} tick={{ fill: '#8a8f98', fontSize: 11 }} />
          <Tooltip
            formatter={(v, name) => [d3(v), name]}
            labelFormatter={(l) => `${l}% platform fee`}
            contentStyle={{ background: '#23252b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
          <Line type="monotone" dataKey="committed" name="Committed (seller)" stroke="#8a8f98" strokeDasharray="4 4" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="effective" name="Effective (buyer)" stroke="#3e8bff" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  )
}

export function FeeFlowBreakdown({ flow, effectivePerAccelHr }) {
  return (
    <figure className="sg-card p-4" data-testid="fee-flow-chart">
      <figcaption className={FIG_CAPTION}>
        <div className={FIG_TITLE}>Fee flow</div>
        <div className={FIG_SUB}>
          seller price → buyer price{typeof effectivePerAccelHr === 'number' ? ` · effective ${d3(effectivePerAccelHr)}/accel-hr` : ''}
        </div>
      </figcaption>
      <ResponsiveContainer width="100%" height={220} aria-label="Fee flow waterfall">
        <BarChart data={flow.segments} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="rgba(255, 255, 255, 0.06)" vertical={false} />
          <XAxis dataKey="label" stroke="#62666d" tickLine={false} axisLine={false} tick={{ fill: '#8a8f98', fontSize: 11 }} interval={0} />
          <YAxis tickFormatter={d2} stroke="#62666d" tickLine={false} axisLine={false} width={56} tick={{ fill: '#8a8f98', fontSize: 11 }} />
          <Tooltip
            formatter={(v, name) => (name === 'base' ? ['', ''] : [d3(v), 'Drivers'])}
            labelFormatter={(l) => l}
            contentStyle={{ background: '#23252b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="w" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {flow.segments.map((s) => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}

export function PartnerSplitView({ split }) {
  return (
    <figure className="sg-card p-4" data-testid="partner-split-view">
      <figcaption className={FIG_CAPTION}>
        <div className={FIG_TITLE}>Partner split</div>
        <div className={FIG_SUB}>platform net vs partner attribution share (§22.1)</div>
      </figcaption>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-elevated" data-testid="partner-split-bar">
        <div className="h-full bg-accent transition-all duration-200" style={{ width: `${split.platformPct || 0}%` }} data-testid="partner-platform-seg" />
        <div className="h-full bg-warning transition-all duration-200" style={{ width: `${split.partnerPct || 0}%` }} data-testid="partner-partner-seg" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="sg-stat__label">Platform gross</div>
          <div className="sg-num sg-fig__big">{d3(split.platformGross)}</div>
          <div className="sg-fig__sub">/ accel-hr</div>
        </div>
        <div>
          <div className="sg-stat__label">— Platform net</div>
          <div className="sg-stat__value sg-num">{d3(split.platform)}</div>
          <div className="sg-fig__sub">{pct(split.platformPct)} of gross</div>
        </div>
        <div>
          <div className="sg-stat__label">— Partner share</div>
          <div className="sg-stat__value sg-num">{d3(split.partner)}</div>
          <div className="sg-fig__sub">{pct(split.partnerPct)} of gross</div>
        </div>
        <div className="flex items-end">
          <span className="sg-fig__sub">Share sums to gross — no leakage.</span>
        </div>
      </div>
    </figure>
  )
}
