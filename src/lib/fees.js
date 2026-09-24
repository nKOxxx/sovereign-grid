// src/lib/fees.js
// Operator Fee Engine math (SPEC §9). PURE functions only — no browser, no React.
//
// Price construction (SPEC §9.2):
//   buyer price  = seller base + pass-through + buyer-paid fee + tax
//   seller payout= seller base - seller-paid fee
// Platform gross revenue is the fee collected, which the operator then splits
// with partners (SPEC §9.3). All values are DEMO / illustrative — never a live
// commercial policy.

/**
 * Fee amount collected, per the selected basis.
 *  - 'pct'  : platformFee is a fraction (e.g. 0.08 = 8%) of seller base price.
 *  - 'perHr': platformFee is a flat USD per accelerator-hour.
 * NOTE: for 'perHr' the caller passes the full hourly unit cost as sellerBase so
 * the flat fee is directly comparable; this helper returns the fee as given.
 */
export function feeAmount({ sellerBase, platformFee, feeBasis = 'pct' }) {
  if (feeBasis === 'perHr') return platformFee
  return sellerBase * platformFee
}

/**
 * Buyer price. splitPct is the buyer's share (0-100) of the fee when payer='split'.
 * - buyer : buyer pays 100% of the fee.
 * - seller: buyer pays 0% (seller pays it out of payout).
 * - split : buyer pays splitPct% of the fee; seller pays the rest.
 * Tax is applied to (sellerBase + passthrough + buyerFee).
 */
export function buyerPrice({ sellerBase, passthrough = 0, platformFee, feeBasis = 'pct', feePayer = 'buyer', splitPct = 50, taxRate = 0 }) {
  const fee = feeAmount({ sellerBase, platformFee, feeBasis })
  let buyerFee = 0
  if (feePayer === 'buyer') buyerFee = fee
  else if (feePayer === 'split') buyerFee = fee * (Math.min(100, Math.max(0, splitPct)) / 100)
  // else feePayer === 'seller' -> buyer pays no fee
  const sub = sellerBase + passthrough + buyerFee
  return sub + sub * taxRate
}

/**
 * Seller payout (SPEC §9.2): seller base minus the seller-paid fee.
 * - buyer : seller pays 0
 * - seller: seller pays the full fee
 * - split : seller pays (100 - splitPct)% of the fee
 */
export function sellerPayout({ sellerBase, platformFee, feeBasis = 'pct', feePayer = 'buyer', splitPct = 50 }) {
  const fee = feeAmount({ sellerBase, platformFee, feeBasis })
  let sellerPaid = 0
  if (feePayer === 'seller') sellerPaid = fee
  else if (feePayer === 'split') sellerPaid = fee * (1 - Math.min(100, Math.max(0, splitPct)) / 100)
  // Payout floor at 0: an operator fee can never drive the seller negative (SPEC §9.2 spirit — payout is a settlement, not a debt).
  return Math.max(0, sellerBase - sellerPaid)
}

/**
 * Platform gross revenue = the fee collected (independent of which side pays it).
 * Gross is split with partners afterwards via partnerSplitPct.
 */
export function platformGrossRevenue({ sellerBase, platformFee, feeBasis = 'pct' }) {
  return feeAmount({ sellerBase, platformFee, feeBasis })
}

/**
 * Split gross revenue between partner(s) and the platform.
 * Returns { partner, platform } (they sum to gross).
 */
export function partnerSplit({ platformGross, partnerSplitPct = 0 }) {
  const share = Math.min(100, Math.max(0, partnerSplitPct)) / 100
  return { partner: platformGross * share, platform: platformGross * (1 - share) }
}

/**
 * Margin guard (SPEC §9.3): prevents publishing a quote when the operator's
 * gross margin falls below the configured minimum. Margin = gross revenue /
 * buyer price. Returns needsApproval=true when below min margin.
 */
export function marginCheck({ buyerPrice: bp, sellerPayout, passthrough = 0, minMarginPct = 0 }) {
  const gross = bp - sellerPayout - passthrough
  const marginPct = bp > 0 ? (gross / bp) * 100 : 0
  const pass = marginPct >= minMarginPct
  return { gross, marginPct, minMarginPct, pass, needsApproval: !pass }
}

/** Everything the Fee Engine screen needs in one call. */
export function computeFees({ sellerBase, passthrough = 0, platformFee, feeBasis = 'pct', feePayer = 'buyer', splitPct = 50, taxRate = 0, partnerSplitPct = 0, minMarginPct = 0 }) {
  const fee = feeAmount({ sellerBase, platformFee, feeBasis })
  const buyer = buyerPrice({ sellerBase, passthrough, platformFee, feeBasis, feePayer, splitPct, taxRate })
  const payout = sellerPayout({ sellerBase, platformFee, feeBasis, feePayer, splitPct })
  const gross = platformGrossRevenue({ sellerBase, platformFee, feeBasis })
  const split = partnerSplit({ platformGross: gross, partnerSplitPct })
  const margin = marginCheck({ buyerPrice: buyer, sellerPayout: payout, passthrough, minMarginPct })
  return { fee, buyerPrice: buyer, sellerPayout: payout, platformGross: gross, partner: split.partner, platformNet: split.platform, ...margin }
}
