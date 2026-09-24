// src/lib/market.test.js
import { describe, it, expect } from 'vitest'
import {
  MATCH_WEIGHTS,
  WEIGHT_SUM,
  hardFilter,
  chinaRouteGate,
  scoreMatch,
  matchAll,
} from './market.js'
import { sellerListings, goldenRequest } from '../data/seed.js'

// Minimal listing/request scaffolds for targeted tests.
function anonChinaListing() {
  return {
    id: 't-china',
    accelerator: { vendor: 'Huawei', model: 'Ascend 910C', profile: 'ascend-910c', origin: 'China' },
    facility: { country: 'China', region: 'Asia', city: 'Shenzhen' },
    dataResidency: 'China',
    software: { frameworks: ['PyTorch (CANN)'] },
    evidence: [],
    verificationStatus: 'Unverified',
  }
}

function evidencedChinaListing() {
  const l = anonChinaListing()
  l.evidence = [
    { type: 'tradeControlDocs', issuer: 'counsel', date: '2026-09-01', status: 'reviewed' },
    { type: 'endUse', issuer: 'compliance', date: '2026-09-01', status: 'reviewed' },
    { type: 'remoteAccessControl', issuer: 'security', date: '2026-08-25', status: 'reviewed' },
    { type: 'reviewerDecision', issuer: 'reviewer', date: '2026-09-10', status: 'reviewed' },
    { type: 'euCompliantProcessing', issuer: 'compliance', date: '2026-09-11', status: 'reviewed' },
    { type: 'zeroDataRetention', issuer: 'compliance', date: '2026-09-11', status: 'reviewed' },
  ]
  l.verificationStatus = 'Sovereign qualified'
  return l
}

function plainRequest(overrides = {}) {
  return {
    accelerator: { preferred: 'ascend-910c', alternatives: [] },
    count: 256,
    startDate: '2027-01-01',
    termMonths: 24,
    firmness: 'firm',
    location: { primary: ['China'], failover: [], prohibited: [], dataResidency: 'China' },
    compliance: { zeroDataRetention: true, euCompliant: true, certifications: [] },
    workload: { frameworks: ['PyTorch (CANN)'] },
    resilience: { failoverRequired: true },
    ...overrides,
  }
}

describe('China route gate', () => {
  it('APPROVES a well-evidenced China offer for a compatible request (no blanket exclusion)', () => {
    const gate = chinaRouteGate(evidencedChinaListing(), plainRequest())
    expect(gate.status).toBe('approved')
    expect(gate.pass).toBe(true)
    expect(hardFilter(evidencedChinaListing(), plainRequest()).pass).toBe(true)
  })

  it('HOLDS an unevidenced China offer (route gate fails)', () => {
    const gate = chinaRouteGate(anonChinaListing(), plainRequest())
    expect(gate.status).toBe('hold')
    expect(gate.pass).toBe(false)
    const filter = hardFilter(anonChinaListing(), plainRequest())
    expect(filter.pass).toBe(false)
    expect(filter.category).toBe('policy')
  })

  it('does not apply the gate to non-China routes', () => {
    const eu = sellerListings.find((l) => l.id === 'eu-h200-nordics')
    expect(chinaRouteGate(eu, goldenRequest).status).toBe('not_applicable')
  })

  it('surfaces a route-conditional China offer for Falcon rather than silently dropping it', () => {
    const cn = sellerListings.find((l) => l.id === 'cn-ascend910c')
    const gate = chinaRouteGate(cn, goldenRequest)
    expect(gate.status).toBe('conditional')
    expect(gate.pass).toBe(false)
    const result = matchAll(sellerListings, goldenRequest)
    const held = result.policyHolds.find((o) => o.listing.id === 'cn-ascend910c')
    expect(held).toBeDefined()
    expect(held.disqualifyReason).toMatch(/route/i)
  })
})

describe('Hard filters', () => {
  it('passes the EU H200 primary offer for Project Falcon', () => {
    const eu = sellerListings.find((l) => l.id === 'eu-h200-nordics')
    expect(hardFilter(eu, goldenRequest).pass).toBe(true)
  })

  it('passes the UAE H200 failover offer for Project Falcon', () => {
    const uae = sellerListings.find((l) => l.id === 'gcc-h200')
    expect(hardFilter(uae, goldenRequest).pass).toBe(true)
  })

  it('excludes the interruptible-only listing when buyer requires firm capacity', () => {
    const tpu = sellerListings.find((l) => l.id === 'tpu-interruptible')
    const filter = hardFilter(tpu, goldenRequest)
    expect(filter.pass).toBe(false)
    expect(filter.category).toBe('firmness')
  })

  it('excludes a listing on jurisdiction mismatch', () => {
    const us = sellerListings.find((l) => l.id === 'us-mi300x-cascade')
    const filter = hardFilter(us, goldenRequest)
    expect(filter.pass).toBe(false)
    expect(filter.category).toBe('location')
  })

  it('excludes on accelerator incompatibility', () => {
    const listing = sellerListings.find((l) => l.id === 'eu-h200-nordics')
    const req = goldenRequest
    const incompatible = {
      ...req,
      accelerator: { preferred: 'tpu-v7', alternatives: [] },
    }
    expect(hardFilter(listing, incompatible).pass).toBe(false)
  })
})

describe('Match scoring', () => {
  it('weights sum to 100', () => {
    expect(WEIGHT_SUM).toBe(100)
  })

  it('returns a score in range 0-100 with per-dimension breakdown and non-empty explanation', () => {
    const eu = sellerListings.find((l) => l.id === 'eu-h200-nordics')
    const m = scoreMatch(eu, goldenRequest)
    expect(m.score).toBeGreaterThanOrEqual(0)
    expect(m.score).toBeLessThanOrEqual(100)
    expect(Object.keys(m.breakdown).length).toBe(7)
    for (const [dim, v] of Object.entries(m.breakdown)) {
      expect(v.score).toBeGreaterThanOrEqual(0)
      expect(v.score).toBeLessThanOrEqual(100)
      expect(v.weight).toBe(MATCH_WEIGHTS[dim])
    }
    expect(m.explanation.length).toBeGreaterThan(0)
  })

  it('ranks the EU H200 primary above a lower-fit offer on the Falcon request', () => {
    const result = matchAll(sellerListings, goldenRequest)
    expect(result.offers.length).toBeGreaterThanOrEqual(3)
    const order = result.offers.map((o) => o.listing.id)
    expect(order.indexOf('eu-h200-nordics')).toBeLessThan(order.indexOf('eu-anon-mi300x'))
  })
})

describe('matchAll on Project Falcon (killer scenario)', () => {
  it('returns >=3 bookable offers including at least one non-NVIDIA', () => {
    const result = matchAll(sellerListings, goldenRequest)
    expect(result.offers.length).toBeGreaterThanOrEqual(3)
    const nonNvidia = result.offers.filter((o) => !/nvidia/i.test(o.listing.accelerator.vendor || 'nvidia'))
    expect(nonNvidia.length).toBeGreaterThanOrEqual(1)
  })

  it('marks the attractive China offer as policy-disqualified, not silently dropped', () => {
    const result = matchAll(sellerListings, goldenRequest)
    const held = result.policyHolds.find((o) => o.listing.id === 'cn-ascend910c')
    expect(held).toBeDefined()
    expect(held.disqualifyReason.length).toBeGreaterThan(0)
  })
})
