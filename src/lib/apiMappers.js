// src/lib/apiMappers.js
// Adapters between the server API payload shapes and the object shapes the
// existing screen render logic expects (the seed/data shapes in src/data/seed.js).
//
// The server (Wave C) is a verbatim port of the demo engine, so its /matches
// response already carries the fields the Match Results table renders. These
// mappers normalize the *collection* endpoints (marketplace, requests) into the
// seed listing / request shapes so MarketplaceHome and PostDemand keep working
// unchanged whether data comes from the API or from seed fallback.

/** Map a (provider_type, gpu_model) pair to the seed acceleratorProfile key. */
export function profileFor(providerType, gpuModel) {
  const m = String(gpuModel || '')
  if (/h200/i.test(m)) return 'h200'
  if (/mi300/i.test(m)) return 'mi300x'
  if (/ascend|910c/i.test(m)) return 'ascend-910c'
  if (/tpu/i.test(m)) return 'tpu-v7'
  const s = `${providerType || ''} ${m}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return s.replace(/^-+|-+$/g, '')
}

/** Coerce a pg date (Date | 'YYYY-MM-DD...') to 'YYYY-MM-DD'. */
function toDateStr(v) {
  if (!v) return null
  if (v instanceof Date) {
    const y = v.getFullYear()
    const mo = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  return String(v).slice(0, 10)
}

/**
 * Map a v_marketplace_listings row (anonymized, no committed price, no seller
 * id, no evidence) into the seed listing shape the marketplace card renders.
 */
export function marketplaceRowToListing(row) {
  const price = Number(row.on_demand_price) || 0
  return {
    id: row.id,
    name: row.name,
    seller: { identity: null, anonymous: true, entityVerified: false },
    accelerator: {
      vendor: row.provider_type,
      model: row.gpu_model,
      profile: profileFor(row.provider_type, row.gpu_model),
    },
    count: row.count,
    node: row.node,
    interconnect: row.interconnect,
    memory: row.memory,
    software: row.software || {},
    portability: row.portability || {},
    facility: row.facility || {},
    dataResidency: row.data_residency,
    firmness: row.firmness,
    startDate: toDateStr(row.start_date),
    minTermMonths: row.min_term_months,
    maxTermMonths: row.max_term_months,
    // Marketplace view exposes only the public on-demand list price; display
    // it as the committed column so the card renders (illustrative).
    price: {
      committedPerAccelHr: price,
      onDemandPerAccelHr: price,
      ...(row.currency ? { currency: row.currency } : {}),
      ...(row.billing_unit ? { billingUnit: row.billing_unit } : {}),
    },
    resilience: row.resilience || {},
    sovereign: row.sovereign || {},
    power: row.power || {},
    verificationStatus: row.verification_status,
    evidenceConfidence: row.evidence_confidence,
    evidence: [],
  }
}

/** Map a /api/requests row into the seed request-card shape. */
export function requestRowToCard(row) {
  const loc = row.location || {}
  return {
    id: row.id,
    name: row.name,
    company: row.company || 'Buyer (anonymous)',
    golden: false,
    accelerator: { preferred: row.accelerator_preferred },
    count: row.count,
    termMonths: row.term_months,
    startDate: toDateStr(row.start_date),
    location: {
      primary: loc.primary || [],
      failover: loc.failover || [],
    },
    firmness: row.firmness,
  }
}

/**
 * Map a seed-shaped request (e.g. goldenRequest or the PostDemand draft) into
 * the requestSchema payload the server's POST /api/requests accepts.
 */
export function requestToPayload(r) {
  return {
    name: r.name,
    ...(r.company ? { company: r.company } : {}),
    accelerator_preferred: r.accelerator && r.accelerator.preferred,
    accelerator_alternatives:
      (r.accelerator && r.accelerator.alternatives) || [],
    count: r.count,
    ...(r.node ? { node: r.node } : {}),
    ...(r.workloadType ? { workload_type: r.workloadType } : {}),
    ...(r.workload ? { workload: r.workload } : {}),
    ...(r.location ? { location: r.location } : {}),
    ...(r.startDate ? { start_date: r.startDate } : {}),
    ...(r.termMonths ? { term_months: Number(r.termMonths) } : {}),
    ...(r.firmness ? { firmness: r.firmness } : {}),
    ...(r.resilience ? { resilience: r.resilience } : {}),
    ...(r.compliance ? { compliance: r.compliance } : {}),
    ...(r.options ? { options: r.options } : {}),
    ...(r.budget ? { budget: r.budget } : {}),
    ...(r.privacy ? { privacy: r.privacy } : {}),
  }
}

/**
 * Compute the same unified matches shape the API returns, but from the seed
 * dataset — used as the graceful offline fallback in MatchResults. The server
 * /matches response is already in this exact shape, so one render handles both.
 */
export function buildUnifiedMatchesFromSeed(listings, request) {
  const result = matchAll(listings, request)

  const bookable = result.offers.map((o) => {
    const l = o.listing
    const cost = computeCosts({
      count: request.count,
      pricePerAccelHr: l.price.committedPerAccelHr,
      onDemandPerAccelHr: l.price.onDemandPerAccelHr,
      utilization: (request.workload && request.workload.utilization) || 0.65,
      termYears: request.termYears || 2,
    })
    return {
      listingId: l.id,
      name: l.name,
      rank: o.rank,
      matchScore: o.score,
      committedPerAccelHr: l.price.committedPerAccelHr,
      effectivePerAccelHr: cost.effectivePerAccelHr,
      totalContractValue: cost.totalContractValue,
      monthlyRunRate: cost.monthlyRunRate,
      commitmentValue: cost.commitmentValue,
      breakEvenUtilization: cost.breakEvenUtilization,
      componentScores: {
        performance: o.breakdown.workloadPerformance.score,
        sovereignty: o.breakdown.sovereignEligibility.score,
        powerResilience: o.breakdown.resilience.score,
      },
      scoreBreakdown: o.breakdown,
      explanation: o.explanation,
    }
  })

  const disqualified = result.policyHolds.map((o) => ({
    listingId: o.listing.id,
    name: o.listing.name,
    matchScore: o.score,
    disqualifyReason: o.disqualifyReason,
    componentScores: {
      performance: o.breakdown.workloadPerformance.score,
      sovereignty: o.breakdown.sovereignEligibility.score,
      powerResilience: o.breakdown.resilience.score,
    },
    scoreBreakdown: o.breakdown,
  }))

  return {
    request: { id: request.id, name: request.name },
    bookable,
    disqualified,
    excluded: result.excluded.length,
  }
}

import { matchAll } from './market.js'
import { computeCosts } from './cost.js'
