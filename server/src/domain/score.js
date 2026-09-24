// server/src/domain/score.js
// Matching & ranking engine for the Wave C Domain API.
//
// This is a VERBATIM PORT of src/lib/market.js (the frontend's unit-tested
// matching engine, 16 tests). It operates on the normalized shapes produced by
// ./normalize.js, which are field-for-field identical to the frontend seed
// listing/request shapes, so the server reproduces the EXACT same 0-100 Match
// Scores, hard filters and policy disqualifications as the UI.
//
// Hard filters first (non-negotiable), then a 0-100 Match Score with a fixed
// weight table (sums to 100). Chinese capacity is evaluated through a
// transaction-specific route gate — never a blanket geography exclusion
// (SPEC §7.1, §10).

export const MATCH_WEIGHTS = {
  workloadPerformance: 25,
  completeEconomics: 20,
  availabilityDelivery: 15,
  sovereignEligibility: 15,
  resilience: 10,
  commercialFlexibility: 10,
  evidenceConfidence: 5,
}

export const WEIGHT_SUM = Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const round1 = (n) => Math.round(n * 10) / 10

// ---------------------------------------------------------------------------
// Evidence helpers
// ---------------------------------------------------------------------------

function hasEvidence(listing, type) {
  return Array.isArray(listing.evidence) && listing.evidence.some((e) => e.type === type && e.status !== 'expired')
}

// ---------------------------------------------------------------------------
// China route gate — transaction-specific, evidence-driven, never blanket.
// ---------------------------------------------------------------------------

/**
 * Evaluates a China-origin facility/accelerator route against the request.
 * Returns { status, pass, reason, missing }.
 */
export function chinaRouteGate(listing, request) {
  const isChinaFacility = listing.facility && listing.facility.country === 'China'
  const isChinaAccel = listing.accelerator && listing.accelerator.origin === 'China'
  if (!isChinaFacility && !isChinaAccel) {
    return { status: 'not_applicable', pass: true, reason: 'Not a China-origin route.', missing: [] }
  }

  // Baseline route evidence required to even be route-reviewable.
  const baseline = [
    { need: 'tradeControlDocs', label: 'trade-control / strategic-goods documentation' },
    { need: 'endUse', label: 'end-use declaration' },
    { need: 'remoteAccessControl', label: 'remote-administration & access-control evidence' },
    { need: 'reviewerDecision', label: 'reviewer decision on this transaction route' },
  ]
  const missingBaseline = baseline.filter((b) => !hasEvidence(listing, b.need)).map((b) => b.label)

  // Transaction-specific requirements derived from the buyer request.
  const transactional = []
  if (request.compliance && request.compliance.euCompliant) {
    transactional.push({ need: 'euCompliantProcessing', label: 'EU-compliant processing for the cross-border route' })
  }
  if (request.compliance && request.compliance.zeroDataRetention) {
    transactional.push({ need: 'zeroDataRetention', label: 'zero-data-retention evidence on the route' })
  }
  if (Array.isArray(request.compliance.certifications) && request.compliance.certifications.length > 0) {
    transactional.push({ need: 'certifications', label: 'requested certifications' })
  }
  const missingTx = transactional.filter((t) => !hasEvidence(listing, t.need)).map((t) => t.label)

  if (missingBaseline.length > 0) {
    return {
      status: 'hold',
      pass: false,
      reason: `Route on hold — missing baseline evidence: ${missingBaseline.join('; ')}.`,
      missing: [...missingBaseline, ...missingTx],
    }
  }
  if (missingTx.length > 0) {
    return {
      status: 'conditional',
      pass: false,
      reason: `Route conditional — transaction-specific evidence outstanding for this buyer's requirements: ${missingTx.join('; ')}.`,
      missing: missingTx,
    }
  }
  return { status: 'approved', pass: true, reason: 'China route approved for this transaction (evidence complete).', missing: [] }
}

// ---------------------------------------------------------------------------
// Hard filters — non-negotiable requirements.
// ---------------------------------------------------------------------------

/**
 * Returns { pass, category, reasons }.
 */
export function hardFilter(listing, request) {
  const reasons = []
  let category = null
  const fail = (cat, detail) => {
    if (!category) category = cat
    reasons.push({ code: cat, detail })
  }

  // China route gate first — route-specific, never blanket.
  const gate = chinaRouteGate(listing, request)
  if (gate.status !== 'not_applicable' && !gate.pass) {
    fail('policy', gate.reason)
  }

  // Jurisdiction / location.
  const reqLocs = request.location || {}
  const primary = reqLocs.primary || []
  const failover = reqLocs.failover || []
  const prohibited = reqLocs.prohibited || []
  const country = listing.facility ? listing.facility.country : null
  if (country) {
    if ((prohibited || []).includes(country)) {
      fail('location', `${country} is on the buyer's prohibited list.`)
    } else if (!primary.includes(country) && !failover.includes(country)) {
      fail('location', `Facility jurisdiction ${country} is outside the buyer's primary (${primary.join('/')}) and failover (${failover.join('/')}) regions.`)
    }
  }

  // Data residency (policy category) — enforced only for primary-region listings.
  if (reqLocs.dataResidency) {
    const country = listing.facility ? listing.facility.country : null
    if (country && primary.includes(country)) {
      const want = reqLocs.dataResidency
      const have = listing.dataResidency || ''
      if (!have.toLowerCase().includes(want.toLowerCase()) && !want.toLowerCase().includes(have.toLowerCase())) {
        fail('policy', `Data residency '${have}' does not satisfy requested '${want}'.`)
      }
    }
  }

  // Firmness / access model.
  const wantFirm = request.firmness
  const haveFirm = listing.firmness
  if (wantFirm === 'firm' && haveFirm === 'interruptible') {
    fail('firmness', 'Buyer requires firm (committed) capacity; listing is interruptible-only.')
  }

  // Minimum capacity.
  if (request.count && listing.count < request.count) {
    fail('capacity', `Listing capacity ${listing.count} accelerators is below the requested minimum ${request.count}.`)
  }

  // Timing: buyer cannot start before listing is available, and listing must support the term.
  if (request.startDate && listing.startDate && request.startDate < listing.startDate) {
    fail('timing', `Requested start ${request.startDate} precedes listing availability ${listing.startDate}.`)
  }
  if (request.termMonths && listing.minTermMonths && request.termMonths < listing.minTermMonths) {
    fail('timing', `Requested term ${request.termMonths} months is below the listing minimum ${listing.minTermMonths} months.`)
  }
  if (request.termMonths && listing.maxTermMonths && request.termMonths > listing.maxTermMonths) {
    fail('timing', `Requested term ${request.termMonths} months exceeds the listing maximum ${listing.maxTermMonths} months.`)
  }

  // Accelerator / software compatibility.
  const accel = request.accelerator || {}
  const pref = accel.preferred
  const alts = accel.alternatives || []
  const lAccel = listing.accelerator ? listing.accelerator.profile : null
  if (lAccel && pref && lAccel !== pref && !alts.includes(lAccel)) {
    fail('compat', `Accelerator ${lAccel} is neither the preferred ${pref} nor an accepted alternative.`)
  }
  const reqFrameworks = request.workload && request.workload.frameworks ? request.workload.frameworks : []
  if (reqFrameworks.length > 0) {
    const haveFW = new Set((listing.software && listing.software.frameworks) || [])
    const missingFW = reqFrameworks.filter((f) => !haveFW.has(f))
    if (missingFW.length > 0) {
      fail('compat', `Requested framework(s) not supported by listing: ${missingFW.join(', ')}.`)
    }
  }
  return { pass: reasons.length === 0, category, reasons }
}

// ---------------------------------------------------------------------------
// Dimension scorers (0-100 each). Deterministic, documented heuristics.
// ---------------------------------------------------------------------------

function scoreWorkloadPerformance(listing, request) {
  let s = 60
  const accel = request.accelerator || {}
  const pref = accel.preferred
  const alts = accel.alternatives || []
  const lAccel = listing.accelerator ? listing.accelerator.profile : null
  if (lAccel === pref) s += 30
  else if (alts.includes(lAccel)) s += 15
  else s -= 30

  const reqFW = (request.workload && request.workload.frameworks) || []
  const haveFW = new Set((listing.software && listing.software.frameworks) || [])
  if (reqFW.length > 0) {
    const covered = reqFW.filter((f) => haveFW.has(f)).length / reqFW.length
    s += covered * 10
  }
  const port = listing.portability && listing.portability.rating
  if (port === 'native') s += 10
  else if (port === 'partial') s += 5
  else if (port === 'port-required') s -= 5
  return clamp(Math.round(s))
}

function scoreCompleteEconomics(listing) {
  const price = listing.price ? listing.price.committedPerAccelHr : 0
  if (price <= 0) return 50
  return clamp(Math.round(130 - price * 25))
}

function scoreAvailabilityDelivery(listing, request) {
  let s = 50
  if (request.startDate && listing.startDate) {
    if (listing.startDate <= request.startDate) s += 20
    const months = monthDiff(listing.startDate, request.startDate)
    if (months >= 2) s += 10
  }
  if (listing.leadTimeWeeks && listing.leadTimeWeeks <= 4) s += 10
  if (listing.provisioning && listing.provisioning.onTimePct >= 90) s += 10
  return clamp(Math.round(s))
}

function scoreSovereignEligibility(listing, request) {
  let s = 50
  const reqLocs = request.location || {}
  const primary = reqLocs.primary || []
  const failover = reqLocs.failover || []
  const country = listing.facility ? listing.facility.country : null
  if (country && primary.includes(country)) s += 25
  else if (country && failover.includes(country)) s += 10

  const residency = listing.dataResidency || ''
  const want = reqLocs.dataResidency || ''
  if (want && residency.match(new RegExp(want.split(' ')[0], 'i'))) s += 15

  const profile = listing.sovereign && listing.sovereign.eligibilityProfile
  if (profile && /qualified|approved/i.test(profile)) s += 10
  return clamp(Math.round(s))
}

function scoreResilience(listing, request) {
  let s = 40
  const res = listing.resilience || {}
  const sla = res.slaPct || 0
  if (sla >= 99.9) s += 20
  else if (sla >= 99.5) s += 10
  const fo = res.failover || 'none'
  if (fo === 'multi-region' || fo === 'cross-site') s += 25
  else if (fo === 'single-site') s += 10
  if (request.resilience && request.resilience.failoverRequired && fo !== 'none') s += 15
  return clamp(Math.round(s))
}

function scoreCommercialFlexibility(listing, request) {
  let s = 50
  if (listing.firmness === 'firm' && request.firmness === 'firm') s += 10
  if (listing.maxTermMonths && request.termMonths && listing.maxTermMonths >= request.termMonths) s += 20
  if (listing.commitment && listing.commitment.releaseClause) s += 10
  if (listing.commercial && listing.commercial.subleaseAllowed) s += 10
  return clamp(Math.round(s))
}

function scoreEvidenceConfidence(listing) {
  let s = 40
  const vs = (listing.verificationStatus || '').toLowerCase()
  if (/operationally verified|sovereign qualified/.test(vs)) s += 30
  else if (/capacity evidenced/.test(vs)) s += 20
  else if (/identity verified/.test(vs)) s += 10
  const ev = listing.evidence || []
  if (ev.some((e) => e.status === 'expired')) s -= 10
  if (ev.length >= 3) s += 10
  return clamp(Math.round(s))
}

function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

// ---------------------------------------------------------------------------
// Match scoring
// ---------------------------------------------------------------------------

const SCORERS = {
  workloadPerformance: scoreWorkloadPerformance,
  completeEconomics: scoreCompleteEconomics,
  availabilityDelivery: scoreAvailabilityDelivery,
  sovereignEligibility: scoreSovereignEligibility,
  resilience: scoreResilience,
  commercialFlexibility: scoreCommercialFlexibility,
  evidenceConfidence: scoreEvidenceConfidence,
}

/**
 * Scores a listing against a request. Returns
 * { score, breakdown, explanation }.
 */
export function scoreMatch(listing, request) {
  const breakdown = {}
  let total = 0
  for (const dim of Object.keys(MATCH_WEIGHTS)) {
    const weight = MATCH_WEIGHTS[dim]
    const score = SCORERS[dim](listing, request)
    const contribution = round1((weight * score) / 100)
    breakdown[dim] = { weight, score, contribution }
    total += contribution
  }
  const score = clamp(Math.round(total))
  const explanation = buildExplanation(listing, request, breakdown, score)
  return { score, breakdown, explanation }
}

function buildExplanation(listing, request, breakdown, score) {
  const sorted = Object.entries(breakdown).sort((a, b) => b[1].score - a[1].score)
  const top = sorted.slice(0, 2)
  const bottom = sorted.slice(-2).reverse()
  const accel = listing.accelerator ? listing.accelerator.model : 'capacity'
  const country = listing.facility ? listing.facility.country : 'unknown'
  const price = listing.price ? listing.price.committedPerAccelHr : null
  const bits = []
  bits.push(`${accel} in ${country} scores ${score}/100.`)
  bits.push(`Strongest: ${top.map(([d, v]) => `${d} ${v.score}`).join(', ')}.`)
  bits.push(`Watch: ${bottom.map(([d, v]) => `${d} ${v.score}`).join(', ')}.`)
  if (price) bits.push(`Committed rate ${price.toFixed(2)} USD/accel-hr.`)
  return bits.join(' ')
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Runs hard filters + scoring over all listings for a request.
 * returns { offers, policyHolds, excluded }.
 */
export function matchAll(listings, request) {
  const offers = []
  const policyHolds = []
  const excluded = []
  for (const listing of listings) {
    const f = hardFilter(listing, request)
    const m = scoreMatch(listing, request)
    if (f.pass) {
      offers.push({ listing, ...m })
    } else if (f.category === 'policy') {
      if (f.reasons.length > 0) {
        policyHolds.push({ listing, ...m, disqualifyReason: f.reasons[0].detail })
      } else {
        excluded.push({ listing, reasons: f.reasons })
      }
    } else {
      excluded.push({ listing, reasons: f.reasons })
    }
  }
  const byScore = (a, b) => b.score - a.score
  offers.sort(byScore)
  policyHolds.sort(byScore)
  offers.forEach((o, i) => { o.rank = i + 1 })
  policyHolds.forEach((o, i) => { o.rank = i + 1 })
  return { offers, policyHolds, excluded }
}
