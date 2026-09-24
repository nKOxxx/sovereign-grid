// server/src/domain/normalize.js
// Quote / entity normalization for the Wave C domain API.
//
// Two jobs:
//   1. Map DB rows (listings function output, requests rows) into the EXACT
//      object shapes the ported scoring engine (./score.js, itself a verbatim
//      port of src/lib/market.js) expects — so the server reproduces the same
//      0-100 scores, effective $/hr and policy verdicts as the frontend.
//   2. Provide the complete-cost quote view the demo's Match Results table
//      renders: committed $/accel-hr (the quote) + effective $/hr over the
//      request's term + utilization (volume-weighted complete cost).
//
// accelerator derivation: the listings table stores provider_type + gpu_model;
// the frontend drives scoring off an accelerator { profile, vendor, model,
// origin }. profile maps to the src/data/seed.js acceleratorProfiles keys so
// the score.js compat logic (preferred / alternatives) matches the demo.

/** Map a (provider, gpu_model) pair to the seed accelerator profile key. */
export function profileFor(providerType, gpuModel) {
  const m = String(gpuModel || '')
  if (/h200/i.test(m)) return 'h200'
  if (/mi300/i.test(m)) return 'mi300x'
  if (/ascend|910c/i.test(m)) return 'ascend-910c'
  if (/tpu/i.test(m)) return 'tpu-v7'
  // fallback: deterministic slug so unknown accelerators still work
  const s = `${providerType || ''} ${m}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return s.replace(/^-+|-+$/g, '')
}

/** China-origin accelerator (drives the route gate's isChinaAccel branch). */
function accelOrigin(providerType) {
  return /huawei/i.test(providerType || '') ? 'China' : 'US'
}

/**
 * Normalize a raw listing jsonb (from match_listings_for_match()) into the
 * listing shape consumed by ./score.js. Field-for-field matches the frontend
 * seed listing shape (src/data/seed.js sellerListings entries).
 */
export function normalizeListing(raw) {
  return {
    id: raw.id,
    name: raw.name,
    accelerator: {
      profile: profileFor(raw.provider_type, raw.gpu_model),
      vendor: raw.provider_type,
      model: raw.gpu_model,
      origin: accelOrigin(raw.provider_type),
    },
    count: raw.count,
    node: raw.node,
    interconnect: raw.interconnect,
    memory: raw.memory,
    software: raw.software || {},
    portability: raw.portability || {},
    facility: raw.facility || {},
    dataResidency: raw.data_residency,
    firmness: raw.firmness,
    startDate: raw.start_date,
    minTermMonths: raw.min_term_months,
    maxTermMonths: raw.max_term_months,
    price: {
      committedPerAccelHr: raw.committed_price,
      onDemandPerAccelHr: raw.on_demand_price,
    },
    currency: raw.currency,
    billingUnit: raw.billing_unit,
    commercial: raw.commercial || {},
    commitment: raw.commitment || {},
    resilience: raw.resilience || {},
    sovereign: raw.sovereign || {},
    power: raw.power || {},
    verificationStatus: raw.verification_status,
    evidenceConfidence: raw.evidence_confidence,
    leadTimeWeeks: raw.lead_time_weeks,
    provisioning: raw.provisioning || {},
    evidence: raw.evidence || [],
  }
}

/** Coerce a DATE column (pg returns a JS Date at LOCAL midnight) to 'YYYY-MM-DD'.
 *  Uses local date components, NOT toISOString() — node-pg parses a Postgres
 *  `date` as a local-midnight Date, and toISOString() (UTC) can shift the
 *  calendar day back by one in timezones ahead of UTC (e.g. -04:00 turns
 *  2027-01-01 into 2026-12-31T20:00Z), which silently drops a start-date /
 *  availability point in scoring. Building the string from the local Y/M/D
 *  preserves the intended calendar date in any timezone. */
function toDateString(v) {
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
 * Normalize a requests table row into the request shape ./score.js expects.
 * termYears is derived from term_months (the frontend golden request carries
 * termYears alongside termMonths).
 */
export function normalizeRequest(row) {
  return {
    id: row.id,
    name: row.name,
    accelerator: {
      preferred: row.accelerator_preferred,
      alternatives: row.accelerator_alternatives || [],
    },
    count: row.count,
    node: row.node,
    workload_type: row.workload_type,
    workload: row.workload || {},
    location: row.location || {},
    startDate: toDateString(row.start_date),
    termMonths: row.term_months,
    termYears: Math.max(1, Math.round((row.term_months || 1) / 12)),
    firmness: row.firmness,
    resilience: row.resilience || {},
    compliance: row.compliance || {},
    options: row.options || {},
    privacy: row.privacy || {},
    budget: row.budget || {},
    region: row.region,
  }
}

/**
 * Complete-cost quote view: committed $/accel-hr plus the volume-weighted
 * effective $/hr for the request's count / utilization / term (the same inputs
 * the demo's Match Results table uses — see src/screens/MatchResults.jsx, which
 * calls cost.computeCosts with goldenRequest.count/.workload.utilization/termYears).
 */
export function quoteView(normalizedListing, normalizedRequest, computeCosts) {
  const price = normalizedListing.price.committedPerAccelHr ?? 0
  const onDemand = normalizedListing.price.onDemandPerAccelHr ?? price
  const utilization =
    (normalizedRequest.workload && normalizedRequest.workload.utilization) || 0.65
  const cost = computeCosts({
    count: normalizedRequest.count,
    pricePerAccelHr: price,
    onDemandPerAccelHr: onDemand,
    utilization,
    termYears: normalizedRequest.termYears || 2,
  })
  return {
    committedPerAccelHr: price,
    onDemandPerAccelHr: onDemand,
    effectivePerAccelHr: cost.effectivePerAccelHr,
    totalContractValue: cost.totalContractValue,
    monthlyRunRate: cost.monthlyRunRate,
    commitmentValue: cost.commitmentValue,
    breakEvenUtilization: cost.breakEvenUtilization,
  }
}
