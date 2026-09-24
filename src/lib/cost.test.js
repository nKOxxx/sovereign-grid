// src/lib/cost.test.js
import { describe, it, expect } from 'vitest'
import {
  monthlyRunRate,
  totalContractValue,
  effectivePerAccelHr,
  commitmentValue,
  breakEvenUtilization,
  resiliencePremium,
  sovereigntyPremium,
  computeCosts,
  HOURS_PER_MONTH,
  financingAdjustedTCV,
  netOfResale,
  effectivePerAccelHrAdjusted,
  computeCalculator,
  WORKLOAD_PROFILES,
  workloadCost,
  workloadCostsFor,
  spotExposure,
} from './cost.js'

describe('cost calculator', () => {
  it('monthly run rate = count * 730 * committed price', () => {
    expect(monthlyRunRate({ count: 256, pricePerAccelHr: 2.0 })).toBe(256 * HOURS_PER_MONTH * 2.0)
  })

  it('effective $/accel-hr rises as utilization falls (fixed reservation)', () => {
    const hi = effectivePerAccelHr({ count: 256, pricePerAccelHr: 2.0, utilization: 0.8, termYears: 2 })
    const lo = effectivePerAccelHr({ count: 256, pricePerAccelHr: 2.0, utilization: 0.4, termYears: 2 })
    expect(lo).toBeGreaterThan(hi)
  })

  it('committing saves money vs on-demand at realistic utilization', () => {
    const v = commitmentValue({ count: 256, committedPerAccelHr: 2.0, onDemandPerAccelHr: 3.0, utilization: 0.8, termYears: 2 })
    expect(v).toBeGreaterThan(0)
  })

  it('break-even utilization is in [0,1]', () => {
    const be = breakEvenUtilization({ committedPerAccelHr: 2.0, onDemandPerAccelHr: 3.0, count: 256, termYears: 2 })
    expect(be).toBeGreaterThan(0)
    expect(be).toBeLessThanOrEqual(1)
  })

  it('premium line items scale with TCV and pct', () => {
    const base = { count: 256, pricePerAccelHr: 2.0, setupCost: 0, termYears: 1 }
    const tcv = totalContractValue(base)
    expect(resiliencePremium({ ...base, pct: 5 })).toBeCloseTo(tcv * 0.05, 5)
    expect(sovereigntyPremium({ ...base, pct: 3 })).toBeCloseTo(tcv * 0.03, 5)
  })

  it('computeCosts returns a coherent aggregate', () => {
    const c = computeCosts({ count: 256, pricePerAccelHr: 2.0, onDemandPerAccelHr: 3.0, utilization: 0.8, termYears: 2, resiliencePct: 4, sovereigntyPct: 3 })
    expect(c.totalContractValue).toBeGreaterThan(0)
    expect(c.effectivePerAccelHr).toBeGreaterThan(0)
    expect(c.commitmentValue).toBeGreaterThan(0)
    expect(c.resiliencePremium).toBeGreaterThan(0)
    expect(c.sovereigntyPremium).toBeGreaterThan(0)
  })

  it('financing adds simple interest only on the financed portion', () => {
    const base = totalContractValue({ count: 256, pricePerAccelHr: 2.0, termYears: 2 })
    const f100 = financingAdjustedTCV({ count: 256, pricePerAccelHr: 2.0, termYears: 2, financedPct: 100, financingRate: 8 })
    // 100% financed at 8% simple over 2 years -> base * (1 + 0.16)
    expect(f100).toBeCloseTo(base * 1.16, 5)
    const f50 = financingAdjustedTCV({ count: 256, pricePerAccelHr: 2.0, termYears: 2, financedPct: 50, financingRate: 8 })
    expect(f50).toBeCloseTo(base * 1.08, 5)
    // 0 financing -> unchanged
    expect(financingAdjustedTCV({ count: 256, pricePerAccelHr: 2.0, termYears: 2 })).toBeCloseTo(base, 5)
  })

  it('netOfResale recovers a fraction of TCV and never goes negative', () => {
    const base = totalContractValue({ count: 256, pricePerAccelHr: 2.0, termYears: 2 })
    expect(netOfResale({ tcv: base, resalePct: 20 })).toBeCloseTo(base * 0.8, 5)
    expect(netOfResale({ tcv: base, resalePct: 0 })).toBeCloseTo(base, 5)
    expect(netOfResale({ tcv: 100, resalePct: 150 })).toBe(0)
  })

  it('effective $/accel-hr drops when resale recovery is high (financing offset)', () => {
    const util = 0.8
    const noResale = effectivePerAccelHrAdjusted({ count: 256, pricePerAccelHr: 2.0, utilization: util, termYears: 2, resalePct: 0 })
    const withResale = effectivePerAccelHrAdjusted({ count: 256, pricePerAccelHr: 2.0, utilization: util, termYears: 2, resalePct: 30 })
    expect(withResale).toBeLessThan(noResale)
  })

  it('computeCalculator returns all seven D07 outputs and reacts to term', () => {
    const c1 = computeCalculator({ count: 256, pricePerAccelHr: 2.15, onDemandPerAccelHr: 3.1, utilization: 0.65, termYears: 1, resiliencePct: 4, sovereigntyPct: 3, financedPct: 60, financingRate: 7, resalePct: 10 })
    expect(c1.monthlyRunRate).toBeGreaterThan(0)
    expect(c1.totalContractValue).toBeGreaterThan(c1.monthlyRunRate)
    expect(c1.effectivePerAccelHr).toBeGreaterThan(0)
    // commitment value matches the on-demand - committed formula (can be negative)
    expect(c1.commitmentValue).toBeCloseTo(
      commitmentValue({ count: 256, committedPerAccelHr: 2.15, onDemandPerAccelHr: 3.1, utilization: 0.65, setupCost: 0, termYears: 1 }),
      0,
    )
    expect(c1.breakEvenUtilization).toBeGreaterThan(0)
    expect(c1.breakEvenUtilization).toBeLessThanOrEqual(1)
    expect(c1.resiliencePremium).toBeGreaterThan(0)
    expect(c1.sovereigntyPremium).toBeGreaterThan(0)
    expect(c1.financingInterest).toBeGreaterThan(0)
    expect(c1.netTotalContractValue).toBeLessThan(c1.totalContractValue * 1.2)
  })

  it('workload cost scales linearly with effective $/accel-hr and GPU-hours', () => {
    expect(workloadCost({ effectivePerAccelHr: 2.1, gpuHours: 1000 })).toBe(2100)
    expect(workloadCost({ effectivePerAccelHr: 2.1, gpuHours: 7300 })).toBe(15330)
    // bigger run costs more
    const c7b = workloadCost({ effectivePerAccelHr: 2.0, gpuHours: WORKLOAD_PROFILES['7b-train'].gpuHours })
    const c70b = workloadCost({ effectivePerAccelHr: 2.0, gpuHours: WORKLOAD_PROFILES['70b-train'].gpuHours })
    expect(c70b).toBeGreaterThan(c7b)
  })

  it('workloadCostsFor returns a cost per workload profile', () => {
    const all = workloadCostsFor(2.0)
    expect(Object.keys(all)).toEqual(Object.keys(WORKLOAD_PROFILES))
    expect(all['405b-train']).toBeGreaterThan(all['70b-train'])
  })

  it('spot exposure is 100% for interruptible capacity', () => {
    expect(spotExposure({ firmness: 'interruptible', minGuaranteed: 0 })).toBe(1)
    expect(spotExposure({ firmness: 'interruptible', minGuaranteed: 0.5 })).toBe(1)
  })

  it('firm capacity spot exposure equals releasable share (1 - minGuaranteed)', () => {
    expect(spotExposure({ firmness: 'firm', minGuaranteed: 0.7 })).toBe(0.3)
    expect(spotExposure({ firmness: 'firm', minGuaranteed: 1 })).toBe(0)
    expect(spotExposure({ firmness: 'firm' })).toBe(1)
    // falls back to 100% spot when no guarantee is stated
    expect(spotExposure({ firmness: 'firm' })).toBe(1)
  })
})
