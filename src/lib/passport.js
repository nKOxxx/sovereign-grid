// src/lib/passport.js
// Capacity Passport builder (SPEC §11, D09 + D16). PURE functions.
//
// Builds an evidence-backed asset profile from a seed listing and accelerator
// profile: sections, per-evidence reviewer/date/expiry/scope/freshness, a
// verification status ladder, and scores with methodology version, evidence
// coverage and confidence. Every number is DEMO / illustrative.
//
// Demo-sellers are NEVER awarded the top ladder rungs ("Sovereign qualified" or
// "Delivery verified") — the ladder is hard-capped at "Operationally verified"
// for the demo so no unearned top status is implied.

import { acceleratorProfiles } from '../data/seed.js'

export const VERIFICATION_LADDER = [
  'Unverified',
  'Identity verified',
  'Capacity evidenced',
  'Operationally verified',
  'Sovereign qualified',
  'Delivery verified',
]

// Demo cap: rung index = 4 ('Operationally verified'). Hard ceiling for the demo.
const MAX_DEMO_RUNG = 4

export function ladderRung(status) {
  const i = VERIFICATION_LADDER.findIndex((s) => s === status)
  return i >= 0 ? i + 1 : 1
}

export function cappedVerificationStatus(status) {
  const rung = Math.min(ladderRung(status), MAX_DEMO_RUNG)
  return VERIFICATION_LADDER[rung - 1]
}

// Which passport section each evidence type maps to, plus a friendly label.
export const EVIDENCE_META = {
  identity: { section: 'identity', label: 'Identity' },
  capacityControl: { section: 'control', label: 'Capacity control' },
  benchmark: { section: 'technical', label: 'Benchmark / technical' },
  power: { section: 'power', label: 'Power certainty' },
  resilience: { section: 'resilience', label: 'Resilience' },
  endUse: { section: 'sovereignty', label: 'End-use declaration' },
  sovereignty: { section: 'sovereignty', label: 'Sovereignty' },
  remoteAccessControl: { section: 'sovereignty', label: 'Remote-access controls' },
  tradeControlDocs: { section: 'tradeControl', label: 'Trade-control review' },
  reviewerDecision: { section: 'tradeControl', label: 'Reviewer decision' },
}

// Default review validity in days, by evidence type (DEMO policy).
const VALIDITY_DAYS = {
  identity: 365,
  capacityControl: 365,
  benchmark: 90,
  power: 180,
  resilience: 365,
  endUse: 365,
  sovereignty: 365,
  remoteAccessControl: 365,
  tradeControlDocs: 90,
  reviewerDecision: 60,
}

// DEMO scenario: drive some evidence into "aging"/"expired" so the freshness
// indicator system (simple fresh/aging/expired) is visibly exercised.
// keyed by listing id -> { evidenceType: expiry date ISO }
export const DEMO_EXPIRY_OVERRIDE = {
  'cn-ascend910c': { endUse: '2026-12-01', tradeControlDocs: '2026-08-15', reviewerDecision: '2026-11-10' },
  'eu-anon-mi300x': { benchmark: '2026-11-10' },
}

// DEMO reviewer pool, chosen deterministically by evidence type.
const REVIEWERS = {
  identity: 'K. Sørensen (SG KYC)',
  capacityControl: 'M. Duarte (SG Ops)',
  benchmark: 'I. Petrova (Technical review)',
  power: 'T. Okafor (Facility review)',
  resilience: 'T. Okafor (Facility review)',
  endUse: 'R. Haddad (Compliance)',
  sovereignty: 'R. Haddad (Compliance)',
  remoteAccessControl: 'A. Klein (Security)',
  tradeControlDocs: 'E. Wu (Trade-control counsel)',
  reviewerDecision: 'SG Review Committee',
}

const AGING_DAYS = 90

/** Simple freshness indicator from date/expiry. Returns 'fresh' | 'aging' | 'expired'. */
export function evidenceFreshness({ expiry, now, agoDays = AGING_DAYS }) {
  if (!expiry) return 'fresh'
  const exp = new Date(expiry).getTime()
  const t = new Date(now).getTime()
  if (exp < t) return 'expired'
  if (exp - t < agoDays * 86400000) return 'aging'
  return 'fresh'
}

function addDays(iso, days) {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Build a full passport for a seed listing.
 *   now     — reference "today" (ISO) for freshness + status (defaults to now).
 *   profile — accelerator profile object, defaults to the seed lookup.
 */
export function buildPassport(listing, { now = new Date().toISOString(), profile } = {}) {
  const acc = profile || acceleratorProfiles[listing.accelerator.profile] || {}
  const override = DEMO_EXPIRY_OVERRIDE[listing.id] || {}
  const listingEvidence = Array.isArray(listing.evidence) ? listing.evidence : []
  const seenSections = {}

  const evidence = listingEvidence.map((e) => {
    const meta = EVIDENCE_META[e.type] || { section: 'technical', label: e.type }
    const section = meta.section
    const validity = VALIDITY_DAYS[e.type] != null ? VALIDITY_DAYS[e.type] : 365
    const expiry = override[e.type] || addDays(e.date, validity)
    return {
      ...e,
      section,
      label: meta.label,
      reviewer: e.reviewer || REVIEWERS[e.type] || 'SG reviewer',
      expiry,
      freshness: evidenceFreshness({ expiry, now }),
    }
  })

  // Section coverage: present as true if at least one reviewed item maps to it.
  const sections = ['identity', 'control', 'technical', 'power', 'resilience', 'sovereignty', 'tradeControl']
  for (const e of evidence) seenSections[e.section] = true

  // Technical / portability detail from the accelerator profile (D16).
  const technicalExtra = acc.portability ? {
    frameworks: acc.frameworks,
    compilers: acc.compilers,
    precision: acc.precision,
    portability: acc.portability.rating,
    migrationEffort: acc.portability.migrationEffort,
    portabilityNotes: acc.portability.notes,
    benchmarkSource: acc.benchmarkSource,
  } : {}

  // Scores. Methodology version + evidence coverage + confidence on each.
  // Coverage denominator = applicable sections (spec §11.2). A listing may declare
  // `applicableSections`; without it every schema section counts as applicable.
  const applicableSections =
    Array.isArray(listing.applicableSections) && listing.applicableSections.length > 0
      ? sections.filter((s) => listing.applicableSections.includes(s))
      : sections
  const evidenceCoveragePct = Math.round((evidence.length / Math.max(1, applicableSections.length)) * 100)
  const reviewed = evidence.filter((e) => e.status === 'reviewed').length
  const confidence = Math.round(
    evidence.length === 0
      ? 0
      : (reviewed / evidence.length) * (1 - evidence.filter((e) => e.freshness === 'expired').length / evidence.length) * listing.evidenceConfidence
  )

  return {
    listingId: listing.id,
    sellerName: listing.name,
    entity: (listing.seller && listing.seller.identity) || 'Anonymous',
    anonymous: !!(listing.seller && listing.seller.anonymous),
    accelerator: acc.model,
    verificationStatus: cappedVerificationStatus(listing.verificationStatus),
    ladder: VERIFICATION_LADDER,
    rung: ladderRung(cappedVerificationStatus(listing.verificationStatus)),
    maxDemoRung: MAX_DEMO_RUNG,
    evidenceCoveragePct,
    confidence,
    methodologyVersion: 'v0.4 (demo 2026-09)',
    sections: sections.map((s) => ({ id: s, covered: !!seenSections[s] })),
    evidence,
    technicalExtra,
  }
}
