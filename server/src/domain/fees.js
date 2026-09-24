// server/src/domain/fees.js
// Operator Fee Engine domain for the Wave C API (SPEC §9).
//
// THIS FILE IS A VERBATIM PORT OF src/lib/fees.js — the exact fee-construction
// math, so the server returns identical numbers to the frontend Fee Engine
// screen for identical inputs. It also carries the platform fee POLICY DEFAULT
// (the demo's 8% buyer-side fee, DEFAULT_PLATFORM_FEE in
// src/store/MarketContext.jsx) and partner attribution.
//
// Price construction (SPEC §9.2):
//   buyer price   = seller base + pass-through + buyer-paid fee + tax
//   seller payout = seller base - seller-paid fee
// Platform gross revenue is the fee collected, which the operator then splits
// with partners (SPEC §9.3). All values are DEMO / illustrative — never a live
// commercial policy.

// Demo default platform fee policy (mirrors src/store/MarketContext.jsx).
export const DEFAULT_FEE_POLICY = Object.freeze({
  platformFee: 0.08,
  feeBasis: 'pct',
  feePayer: 'buyer',
  splitPct: 50,
  partnerSplitPct: 0.3,
  minMarginPct: 8,
})

/**
 * Merger for a stored policy row: stored values override the demo default,
 * unknown/absent keys fall back to the default. Always returns a complete,
 * valid policy object.
 */
export function resolveFeePolicy(stored = {}) {
  return {
    platformFee: typeof stored.platformFee === 'number' ? stored.platformFee : DEFAULT_FEE_POLICY.platformFee,
    feeBasis: stored.feeBasis || DEFAULT_FEE_POLICY.feeBasis,
    feePayer: stored.feePayer || DEFAULT_FEE_POLICY.feePayer,
    splitPct: typeof stored.splitPct === 'number' ? stored.splitPct : DEFAULT_FEE_POLICY.splitPct,
    partnerSplitPct: typeof stored.partnerSplitPct === 'number' ? stored.partnerSplitPct : DEFAULT_FEE_POLICY.partnerSplitPct,
    minMarginPct: typeof stored.minMarginPct === 'number' ? stored.minMarginPct : DEFAULT_FEE_POLICY.minMarginPct,
  }
}

// ---- verbatim fee math (src/lib/fees.js) ---------------------------------

export function feeAmount({ sellerBase, platformFee, feeBasis = 'pct' }) {
  if (feeBasis === 'perHr') return platformFee
  return sellerBase * platformFee
}

export function buyerPrice({ sellerBase, passthrough = 0, platformFee, feeBasis = 'pct', feePayer = 'buyer', splitPct = 50, taxRate = 0 }) {
  const fee = feeAmount({ sellerBase, platformFee, feeBasis })
  let buyerFee = 0
  if (feePayer === 'buyer') buyerFee = fee
  else if (feePayer === 'split') buyerFee = fee * (Math.min(100, Math.max(0, splitPct)) / 100)
  const sub = sellerBase + passthrough + buyerFee
  return sub + sub * taxRate
}

export function sellerPayout({ sellerBase, platformFee, feeBasis = 'pct', feePayer = 'buyer', splitPct = 50 }) {
  const fee = feeAmount({ sellerBase, platformFee, feeBasis })
  let sellerPaid = 0
  if (feePayer === 'seller') sellerPaid = fee
  else if (feePayer === 'split') sellerPaid = fee * (1 - Math.min(100, Math.max(0, splitPct)) / 100)
  return Math.max(0, sellerBase - sellerPaid)
}

export function platformGrossRevenue({ sellerBase, platformFee, feeBasis = 'pct' }) {
  return feeAmount({ sellerBase, platformFee, feeBasis })
}

export function partnerSplit({ platformGross, partnerSplitPct = 0 }) {
  const share = Math.min(100, Math.max(0, partnerSplitPct)) / 100
  return { partner: platformGross * share, platform: platformGross * (1 - share) }
}

export function marginCheck({ buyerPrice: bp, sellerPayout, passthrough = 0, minMarginPct = 0 }) {
  const gross = bp - sellerPayout - passthrough
  const marginPct = bp > 0 ? (gross / bp) * 100 : 0
  const pass = marginPct >= minMarginPct
  return { gross, marginPct, minMarginPct, pass, needsApproval: !pass }
}

export function computeFees({ sellerBase, passthrough = 0, platformFee, feeBasis = 'pct', feePayer = 'buyer', splitPct = 50, taxRate = 0, partnerSplitPct = 0, minMarginPct = 0 }) {
  const fee = feeAmount({ sellerBase, platformFee, feeBasis })
  const buyer = buyerPrice({ sellerBase, passthrough, platformFee, feeBasis, feePayer, splitPct, taxRate })
  const payout = sellerPayout({ sellerBase, platformFee, feeBasis, feePayer, splitPct })
  const gross = platformGrossRevenue({ sellerBase, platformFee, feeBasis })
  const split = partnerSplit({ platformGross: gross, partnerSplitPct })
  const margin = marginCheck({ buyerPrice: buyer, sellerPayout: payout, passthrough, minMarginPct })
  return { fee, buyerPrice: buyer, sellerPayout: payout, platformGross: gross, partner: split.partner, platformNet: split.platform, ...margin }
}

// Partner attribution helper for the API: turn a stored policy + a per-quote
// seller base into the attributed partner/platform economics.
export function partnerAttribution({ sellerBase, policy }) {
  const p = resolveFeePolicy(policy)
  const fees = computeFees({
    sellerBase,
    platformFee: p.platformFee,
    feeBasis: p.feeBasis,
    feePayer: p.feePayer,
    splitPct: p.splitPct,
    partnerSplitPct: p.partnerSplitPct,
  })
  return { policy: p, fee: fees, partner: fees.partner, platformNet: fees.platformNet }
}
