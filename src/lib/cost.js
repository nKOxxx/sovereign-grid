// src/lib/cost.js
// Complete-cost calculator for the Sovereign Grid demo (Wave 1).
// PURE functions only — no browser APIs, no React. Fully unit-testable in node.
//
// Model: committed/reserved capacity is billed as a full monthly reservation
// (independent of utilization). Utilization  lowers the *effective* $/accelerator-hr
// because more reservation is spread over the same bill. On-demand is billed only
// for utilized hours at a higher rate, which is what makes break-even utilization
// meaningful.
//
// All outputs are DEMO / ILLUSTRATIVE. No figure here is a live market price.

export const HOURS_PER_MONTH = 730
export const MONTHS_PER_YEAR = 12
export const MAX_TERM_YEARS = 5

/**
 * Monthly run rate for committed (reserved) capacity.
 * Independent of utilization — you pay for the reservation either way.
 */
export function monthlyRunRate({ count, pricePerAccelHr }) {
  return count * HOURS_PER_MONTH * pricePerAccelHr
}

/**
 * Total contract value over the selected term (capped at 5 years) plus one-time setup.
 * All committed payments over the term.
 */
export function totalContractValue({ count, pricePerAccelHr, setupCost = 0, termYears }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  return monthlyRunRate({ count, pricePerAccelHr }) * months + setupCost
}

/**
 * Effective cost per accelerator-hour = TCV / (utilized hours over the term).
 * Rises as utilization falls because the reservation is fixed.
 */
export function effectivePerAccelHr({ count, pricePerAccelHr, utilization = 1, setupCost = 0, termYears }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  const billedHours = count * HOURS_PER_MONTH * utilization * months
  if (billedHours <= 0) return 0
  return totalContractValue({ count, pricePerAccelHr, setupCost, termYears }) / billedHours
}

/**
 * Value of committing vs staying on-demand over the same term/utilization:
 * on-demand TCV minus committed TCV. Positive = committing saves money.
 */
export function commitmentValue({ count, committedPerAccelHr, onDemandPerAccelHr, utilization = 1, setupCost = 0, termYears }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  const committed = totalContractValue({ count, pricePerAccelHr: committedPerAccelHr, setupCost, termYears })
  const onDemand = count * HOURS_PER_MONTH * utilization * onDemandPerAccelHr * months
  return onDemand - committed
}

/**
 * Utilization at which committed total cost equals on-demand total cost.
 * Above this utilization, on-demand would be more expensive, so committing wins.
 */
export function breakEvenUtilization({ committedPerAccelHr, onDemandPerAccelHr, setupCost = 0, count = 1, termYears = 1 }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  const denom = count * HOURS_PER_MONTH * onDemandPerAccelHr * months
  if (denom <= 0) return 0
  return Math.min(1, Math.max(0, (monthlyRunRate({ count, pricePerAccelHr: committedPerAccelHr }) * months + setupCost) / denom))
}

/** Incremental cost of failover / hardening / multi-site delivery as a line item. */
export function resiliencePremium({ count, pricePerAccelHr, pct = 0, setupCost = 0, termYears }) {
  return (totalContractValue({ count, pricePerAccelHr, setupCost, termYears }) * pct) / 100
}

/** Incremental cost of the required policy/sovereignty profile as a line item. */
export function sovereigntyPremium({ count, pricePerAccelHr, pct = 0, setupCost = 0, termYears }) {
  return (totalContractValue({ count, pricePerAccelHr, setupCost, termYears }) * pct) / 100
}

/** Aggregate view used by the UI. */
export function computeCosts({ count, pricePerAccelHr, onDemandPerAccelHr, utilization = 0.6, setupCost = 0, termYears = 1, resiliencePct = 0, sovereigntyPct = 0 }) {
  const monthRate = monthlyRunRate({ count, pricePerAccelHr })
  const tcv = totalContractValue({ count, pricePerAccelHr, setupCost, termYears })
  return {
    monthlyRunRate: monthRate,
    totalContractValue: tcv,
    effectivePerAccelHr: effectivePerAccelHr({ count, pricePerAccelHr, utilization, setupCost, termYears }),
    commitmentValue: commitmentValue({ count, committedPerAccelHr: pricePerAccelHr, onDemandPerAccelHr, utilization, setupCost, termYears }),
    breakEvenUtilization: breakEvenUtilization({ committedPerAccelHr: pricePerAccelHr, onDemandPerAccelHr, setupCost, count, termYears }),
    resiliencePremium: resiliencePremium({ count, pricePerAccelHr, pct: resiliencePct, setupCost, termYears }),
    sovereigntyPremium: sovereigntyPremium({ count, pricePerAccelHr, pct: sovereigntyPct, setupCost, termYears }),
  }
}

// ---------------------------------------------------------------------------
// Financing & resale adjustments (used by the Five-Year Calculator, D07).
// All pure and DEMO/illustrative — simple add-on financing and resale recovery.
// ---------------------------------------------------------------------------

/**
 * Contract value after financing a portion of it at a simple add-on annual rate.
 * financedPct is 0–100 (% of TCV financed), financingRate is 0–100 (% per year).
 * Adds simple interest over the term for the financed portion only.
 */
export function financingAdjustedTCV({ count, pricePerAccelHr, setupCost = 0, termYears, financedPct = 0, financingRate = 0 }) {
  const base = totalContractValue({ count, pricePerAccelHr, setupCost, termYears })
  if (financedPct <= 0 || financingRate <= 0) return base
  const financed = base * (Math.min(100, Math.max(0, financedPct)) / 100)
  const years = Math.min(termYears, MAX_TERM_YEARS)
  const interest = financed * (financingRate / 100) * years
  return base + interest
}

/**
 * Total contract value after recovering resalePct (%) of it via resale.
 * Clamped to >= 0.
 */
export function netOfResale({ tcv, resalePct = 0 }) {
  const recovered = Math.min(100, Math.max(0, resalePct)) / 100
  return Math.max(0, tcv * (1 - recovered))
}

/**
 * Effective $/accelerator-hr over the term after financing + resale adjustments.
 */
export function effectivePerAccelHrAdjusted({ count, pricePerAccelHr, utilization = 1, setupCost = 0, termYears, financedPct = 0, financingRate = 0, resalePct = 0 }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  const hours = count * HOURS_PER_MONTH * utilization * months
  if (hours <= 0) return 0
  const fin = financingAdjustedTCV({ count, pricePerAccelHr, setupCost, termYears, financedPct, financingRate })
  return netOfResale({ tcv: fin, resalePct }) / hours
}

/**
 * Full calc inputs -> all D07 outputs in one call so the calculator stays thin.
 * Returns the 7 required outputs plus the financing/resale breakdown.
 */
export function computeCalculator({ count, pricePerAccelHr, onDemandPerAccelHr, utilization = 0.6, setupCost = 0, termYears = 1, resiliencePct = 0, sovereigntyPct = 0, financedPct = 0, financingRate = 0, resalePct = 0 }) {
  const monthRate = monthlyRunRate({ count, pricePerAccelHr })
  const baseTCV = totalContractValue({ count, pricePerAccelHr, setupCost, termYears })
  const financedTCV = financingAdjustedTCV({ count, pricePerAccelHr, setupCost, termYears, financedPct, financingRate })
  const netTCV = netOfResale({ tcv: financedTCV, resalePct })
  return {
    monthlyRunRate: monthRate,
    totalContractValue: baseTCV,
    financingInterest: financedTCV - baseTCV,
    resaleRecovery: financedTCV - netTCV,
    netTotalContractValue: netTCV,
    effectivePerAccelHr: effectivePerAccelHrAdjusted({ count, pricePerAccelHr, utilization, setupCost, termYears, financedPct, financingRate, resalePct }),
    commitmentValue: commitmentValue({ count, committedPerAccelHr: pricePerAccelHr, onDemandPerAccelHr, utilization, setupCost, termYears }),
    breakEvenUtilization: breakEvenUtilization({ committedPerAccelHr: pricePerAccelHr, onDemandPerAccelHr, setupCost, count, termYears }),
    resiliencePremium: resiliencePremium({ count, pricePerAccelHr, pct: resiliencePct, setupCost, termYears }),
    sovereigntyPremium: sovereigntyPremium({ count, pricePerAccelHr, pct: sovereigntyPct, setupCost, termYears }),
  }
}

// ---------------------------------------------------------------------------
// Cost per workload (SPEC §8.2 leftovers) and spot exposure (SPEC §8.1).
// All DEMO / illustrative — GPU-hours are mapped through stated demo assumptions.
// ---------------------------------------------------------------------------

/**
 * Demo workload profiles that map a workload type to an assumed accelerator-hour
 * (GPU-hour) draw so a buyer can answer "what does one run / one RPS tier cost?".
 * The gpuHours here are a DEMO assumption — they are explicitly labelled as such
 * in the UI and are never presented as a measured or live figure.
 */
export const WORKLOAD_PROFILES = {
  '7b-train': {
    id: '7b-train',
    label: 'LLM pretraining — 7B params',
    kind: 'training',
    gpuHours: 7_300,
    unit: 'accelerator-hours (H200, demo)',
    note: 'Assumption: a single 7B pretraining + eval run ≈ 7,300 H200-hours.',
  },
  '70b-train': {
    id: '70b-train',
    label: 'LLM pretraining — 70B params',
    kind: 'training',
    gpuHours: 73_000,
    unit: 'accelerator-hours (H200, demo)',
    note: 'Assumption: a single 70B pretraining + eval run ≈ 73,000 H200-hours.',
  },
  '405b-train': {
    id: '405b-train',
    label: 'LLM pretraining — 405B params',
    kind: 'training',
    gpuHours: 365_000,
    unit: 'accelerator-hours (H200, demo)',
    note: 'Assumption: a single 405B pretraining + eval run ≈ 365,000 H200-hours.',
  },
  'inference-rps': {
    id: 'inference-rps',
    label: 'Inference serving — high RPS tier',
    kind: 'inference',
    gpuHours: 8_760,
    unit: 'accelerator-hours (H200, demo)',
    note: 'Assumption: ~24/7 serving at target RPS with headroom ≈ 8,760 H200-hours/mo.',
  },
}

/** Cost of running one workload at a given effective $/accelerator-hour. */
export function workloadCost({ effectivePerAccelHr, gpuHours }) {
  return effectivePerAccelHr * gpuHours
}

/** Convenience: cost per workload for every profile at the given effective rate. */
export function workloadCostsFor(effectivePerAccelHr) {
  return Object.fromEntries(
    Object.entries(WORKLOAD_PROFILES).map(([id, p]) => [id, workloadCost({ effectivePerAccelHr, gpuHours: p.gpuHours })]),
  )
}

/**
 * Share of the offer's price attributable to spot / interruptible capacity.
 * Derived from the listing's offer data:
 *   - an interruptible listing is 100% spot exposure;
 *   - a firm listing with a minimum guaranteed share (minGuaranteed, 0–1) has
 *     (1 - minGuaranteed) of its capacity releasable/interruptible.
 * Returns 0–1. All demo, never a live figure.
 */
export function spotExposure({ firmness, minGuaranteed } = {}) {
  if (firmness === 'interruptible') return 1
  const g = typeof minGuaranteed === 'number' ? minGuaranteed : 0
  const share = 1 - Math.max(0, Math.min(1, g))
  return Math.round(share * 100) / 100
}
