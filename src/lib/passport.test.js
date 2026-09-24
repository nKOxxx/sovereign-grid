// src/lib/passport.test.js
import { describe, it, expect } from 'vitest'
import { sellerListings } from '../data/seed.js'
import {
  buildPassport,
  evidenceFreshness,
  ladderRung,
  cappedVerificationStatus,
  VERIFICATION_LADDER,
} from './passport.js'

const NOW = '2026-09-24T12:00:00.000Z'
const byId = (id) => sellerListings.find((l) => l.id === id)

describe('capacity passport builder (SPEC §11, D09 + D16)', () => {
  it('never awards a top rung in the demo (cap at Operationally verified)', () => {
    for (const l of sellerListings) {
      const p = buildPassport(l, { now: NOW })
      const rung = ladderRung(p.verificationStatus)
      expect(rung).toBeLessThanOrEqual(p.maxDemoRung)
      expect(VERIFICATION_LADDER.indexOf('Delivery verified') + 1).toBeGreaterThan(p.maxDemoRung)
    }
  })

  it('marks the demo China listing with aging + expired evidence via freshness indicators', () => {
    const p = buildPassport(byId('cn-ascend910c'), { now: NOW })
    const tc = p.evidence.find((e) => e.type === 'tradeControlDocs')
    const eu = p.evidence.find((e) => e.type === 'endUse')
    expect(evidenceFreshness({ expiry: tc.expiry, now: NOW })).toBe('expired')
    expect(evidenceFreshness({ expiry: eu.expiry, now: NOW })).toBe('aging')
    expect(tc.reviewer).toBeTruthy()
    expect(tc.expiry).toBeTruthy()
  })

  it('exposes reviewer, date, expiry and scope on every evidence item', () => {
    for (const l of sellerListings.slice(0, 3)) {
      const p = buildPassport(l, { now: NOW })
      for (const e of p.evidence) {
        expect(e.reviewer).toBeTruthy()
        expect(e.date).toBeTruthy()
        expect(e.expiry).toBeTruthy()
        expect(e.scope).toBeTruthy()
        expect(['fresh', 'aging', 'expired']).toContain(e.freshness)
      }
    }
  })

  it('scores carry methodology version, evidence coverage and confidence', () => {
    const p = buildPassport(byId('eu-h200-nordics'), { now: NOW })
    expect(p.methodologyVersion).toMatch(/v0\.4/)
    expect(p.evidenceCoveragePct).toBeGreaterThan(0)
    expect(p.confidence).toBeGreaterThan(0)
    expect(p.confidence).toBeLessThanOrEqual(100)
  })

  it('builds a full section set (identity, control, technical, power, resilience, sovereignty, trade-control)', () => {
    const p = buildPassport(byId('cn-ascend910c'), { now: NOW })
    const ids = p.sections.map((s) => s.id)
    for (const want of ['identity', 'control', 'technical', 'power', 'resilience', 'sovereignty', 'tradeControl']) {
      expect(ids).toContain(want)
    }
  })

  it('caps a would-be top verification status down to Operationally verified', () => {
    expect(cappedVerificationStatus('Sovereign qualified')).toBe('Operationally verified')
    expect(cappedVerificationStatus('Delivery verified')).toBe('Operationally verified')
    expect(cappedVerificationStatus('Capacity evidenced')).toBe('Capacity evidenced')
  })
})
