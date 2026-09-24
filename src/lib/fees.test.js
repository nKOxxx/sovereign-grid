// src/lib/fees.test.js
import { describe, it, expect } from 'vitest'
import {
  buyerPrice,
  sellerPayout,
  platformGrossRevenue,
  partnerSplit,
  marginCheck,
  computeFees,
  feeAmount,
} from './fees.js'

describe('fee engine math (SPEC §9)', () => {
  it('buyer price = seller base + passthrough + buyer-paid fee + tax', () => {
    // 8% fee on 2.15 base, buyer pays, 5% tax, $0.1 passthrough
    const price = buyerPrice({ sellerBase: 2.15, passthrough: 0.1, platformFee: 0.08, feeBasis: 'pct', feePayer: 'buyer', taxRate: 0.05 })
    const sub = 2.15 + 0.1 + 2.15 * 0.08
    expect(price).toBeCloseTo(sub * 1.05, 5)
  })

  it('seller pays the fee -> payout = base - fee, buyer pays no fee', () => {
    const fee = feeAmount({ sellerBase: 2.15, platformFee: 0.08, feeBasis: 'pct' })
    expect(sellerPayout({ sellerBase: 2.15, platformFee: 0.08, feeBasis: 'pct', feePayer: 'seller' })).toBeCloseTo(2.15 - fee, 5)
    expect(buyerPrice({ sellerBase: 2.15, platformFee: 0.08, feeBasis: 'pct', feePayer: 'seller', taxRate: 0 })).toBeCloseTo(2.15, 5)
  })

  it('split: seller pays (100-splitPct)% of the fee', () => {
    const fee = feeAmount({ sellerBase: 2.0, platformFee: 0.1, feeBasis: 'pct' })
    // split 60/40 buyer/seller
    const payout = sellerPayout({ sellerBase: 2.0, platformFee: 0.1, feeBasis: 'pct', feePayer: 'split', splitPct: 60 })
    expect(payout).toBeCloseTo(2.0 - fee * 0.4, 5)
    const price = buyerPrice({ sellerBase: 2.0, platformFee: 0.1, feeBasis: 'pct', feePayer: 'split', splitPct: 60, taxRate: 0 })
    expect(price).toBeCloseTo(2.0 + fee * 0.6, 5)
  })

  it('per-hr fee basis uses the flat $/hr as the fee', () => {
    expect(feeAmount({ sellerBase: 2.5, platformFee: 0.35, feeBasis: 'perHr' })).toBe(0.35)
    expect(buyerPrice({ sellerBase: 2.5, platformFee: 0.35, feeBasis: 'perHr', feePayer: 'buyer', taxRate: 0 })).toBeCloseTo(2.5 + 0.35, 5)
  })

  it('platform gross revenue = the fee, then partners split it', () => {
    const gross = platformGrossRevenue({ sellerBase: 2.15, platformFee: 0.08, feeBasis: 'pct' })
    expect(gross).toBeCloseTo(2.15 * 0.08, 5)
    const { partner, platform } = partnerSplit({ platformGross: gross, partnerSplitPct: 30 })
    expect(partner).toBeCloseTo(gross * 0.3, 5)
    expect(platform).toBeCloseTo(gross * 0.7, 5)
    expect(partner + platform).toBeCloseTo(gross, 5)
  })

  it('margin guard flags quotes below the operator minimum margin', () => {
    // high fee/margin -> pass
    const ok = marginCheck({ buyerPrice: 2.5, sellerPayout: 1.9, passthrough: 0.1, minMarginPct: 10 })
    expect(ok.pass).toBe(true)
    expect(ok.needsApproval).toBe(false)
    // low margin -> needs operator approval
    const low = marginCheck({ buyerPrice: 2.1, sellerPayout: 2.0, passthrough: 0.1, minMarginPct: 10 })
    expect(low.pass).toBe(false)
    expect(low.needsApproval).toBe(true)
  })

  it('computeFees returns a coherent, self-consistent package', () => {
    const f = computeFees({ sellerBase: 2.15, passthrough: 0.1, platformFee: 0.08, feeBasis: 'pct', feePayer: 'buyer', splitPct: 50, taxRate: 0.05, partnerSplitPct: 25, minMarginPct: 5 })
    expect(f.buyerPrice).toBeGreaterThan(f.sellerPayout)
    expect(f.platformGross).toBeCloseTo(f.platformNet + f.partner, 5)
    expect(f.fee).toBeCloseTo(2.15 * 0.08, 5)
  })
})

// Hub regression test (audit P1): seller payout floors at zero — an operator
// fee can never drive the payout negative, per any fee-payer configuration.
describe('sellerPayout payout floor', () => {
  it('never goes negative when per-hour fee exceeds seller base (feePayer=seller)', () => {
    expect(sellerPayout({ sellerBase: 2.15, platformFee: 2.5, feeBasis: 'perHr', feePayer: 'seller' })).toBe(0)
  })
  it('never goes negative on split configuration with extreme fee (seller pays 100% of it)', () => {
    expect(sellerPayout({ sellerBase: 1.0, platformFee: 10, feeBasis: 'perHr', feePayer: 'split', splitPct: 0 })).toBe(0)
  })
  it('still returns exact payout in the normal regime', () => {
    expect(sellerPayout({ sellerBase: 2.15, platformFee: 0.25, feeBasis: 'perHr', feePayer: 'seller' })).toBeCloseTo(1.9, 5)
  })
})
