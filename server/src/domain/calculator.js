// server/src/domain/calculator.js
// Five-year TCO calculator for the Wave C API.
//
// THIS FILE IS A VERBATIM PORT OF src/lib/cost.js — the exact math, constants
// and function signatures from the frontend's unit-tested calculator
// (src/lib/cost.test.js). The /api/calculator/quote endpoint uses these
// functions so that, for identical inputs, the server returns byte-identical
// outputs to the frontend's Five-Year Calculator screen (SPEC §8). The public
// exports and every formula below intentionally mirror cost.js line-for-line;
// see that file for the full model commentary.
//
// Model: committed/reserved capacity is billed as a full monthly reservation
// (independent of utilization). Utilization lowers the *effective*
// $/accelerator-hr. On-demand is billed only for utilized hours at a higher
// rate, which is what makes break-even utilization meaningful. All DEMO.

export const HOURS_PER_MONTH = 730
export const MONTHS_PER_YEAR = 12
export const MAX_TERM_YEARS = 5

export function monthlyRunRate({ count, pricePerAccelHr }) {
  return count * HOURS_PER_MONTH * pricePerAccelHr
}

export function totalContractValue({ count, pricePerAccelHr, setupCost = 0, termYears }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  return monthlyRunRate({ count, pricePerAccelHr }) * months + setupCost
}

export function effectivePerAccelHr({ count, pricePerAccelHr, utilization = 1, setupCost = 0, termYears }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  const billedHours = count * HOURS_PER_MONTH * utilization * months
  if (billedHours <= 0) return 0
  return totalContractValue({ count, pricePerAccelHr, setupCost, termYears }) / billedHours
}

export function commitmentValue({ count, committedPerAccelHr, onDemandPerAccelHr, utilization = 1, setupCost = 0, termYears }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  const committed = totalContractValue({ count, pricePerAccelHr: committedPerAccelHr, setupCost, termYears })
  const onDemand = count * HOURS_PER_MONTH * utilization * onDemandPerAccelHr * months
  return onDemand - committed
}

export function breakEvenUtilization({ committedPerAccelHr, onDemandPerAccelHr, setupCost = 0, count = 1, termYears = 1 }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  const denom = count * HOURS_PER_MONTH * onDemandPerAccelHr * months
  if (denom <= 0) return 0
  return Math.min(1, Math.max(0, (monthlyRunRate({ count, pricePerAccelHr: committedPerAccelHr }) * months + setupCost) / denom))
}

export function resiliencePremium({ count, pricePerAccelHr, pct = 0, setupCost = 0, termYears }) {
  return (totalContractValue({ count, pricePerAccelHr, setupCost, termYears }) * pct) / 100
}

export function sovereigntyPremium({ count, pricePerAccelHr, pct = 0, setupCost = 0, termYears }) {
  return (totalContractValue({ count, pricePerAccelHr, setupCost, termYears }) * pct) / 100
}

export function financingAdjustedTCV({ count, pricePerAccelHr, setupCost = 0, termYears, financedPct = 0, financingRate = 0 }) {
  const base = totalContractValue({ count, pricePerAccelHr, setupCost, termYears })
  if (financedPct <= 0 || financingRate <= 0) return base
  const financed = base * (Math.min(100, Math.max(0, financedPct)) / 100)
  const years = Math.min(termYears, MAX_TERM_YEARS)
  const interest = financed * (financingRate / 100) * years
  return base + interest
}

export function netOfResale({ tcv, resalePct = 0 }) {
  const recovered = Math.min(100, Math.max(0, resalePct)) / 100
  return Math.max(0, tcv * (1 - recovered))
}

export function effectivePerAccelHrAdjusted({ count, pricePerAccelHr, utilization = 1, setupCost = 0, termYears, financedPct = 0, financingRate = 0, resalePct = 0 }) {
  const months = Math.min(termYears, MAX_TERM_YEARS) * MONTHS_PER_YEAR
  const hours = count * HOURS_PER_MONTH * utilization * months
  if (hours <= 0) return 0
  const fin = financingAdjustedTCV({ count, pricePerAccelHr, setupCost, termYears, financedPct, financingRate })
  return netOfResale({ tcv: fin, resalePct }) / hours
}

/**
 * Full calc inputs -> all D07 outputs in one call (VERBATIM from
 * src/lib/cost.js computeCalculator).
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

/** Compute the complete-cost monthly / TCV view used by matches' quote table. */
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
