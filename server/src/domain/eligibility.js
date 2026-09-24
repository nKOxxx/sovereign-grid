// server/src/domain/eligibility.js
// Eligibility / policy engine domain for the Wave C API (SPEC §10).
//
//   * evaluateEligibility() — routes a listing/request pair through the
//     evidence-driven route gate and produces a structured decision record:
//     approved (pass) | conditional (disqualified, attractive) | hold |
//     not_applicable. It is the server half of the demo's "transparent
//     disqualification" section: Chinese capacity is NEVER blanket-excluded —
//     every transaction carries its own evidence-driven decision.
//   * applyEligibilityDecision() / isPassed() — the human approval gate,
//     ported verbatim from src/lib/eligibility.js.

import { chinaRouteGate } from './score.js'

export const ELIGIBILITY_OUTCOMES = ['preScreened', 'needsEvidence', 'conditional', 'hold', 'approvedByReviewer']

export const OUTCOME_LABELS = {
  preScreened: 'Pre-screened',
  needsEvidence: 'Needs evidence',
  conditional: 'Conditional',
  hold: 'Hold',
  approvedByReviewer: 'Approved by reviewer',
}

/**
 * Evaluate a normalized listing against a normalized request through the
 * route gate. Returns a structured decision record surfaced to the buyer.
 */
export function evaluateEligibility(listing, request) {
  const gate = chinaRouteGate(listing, request)
  return {
    status: gate.status, // 'approved' | 'conditional' | 'hold' | 'not_applicable'
    pass: gate.pass,
    reason: gate.reason,
    missing: gate.missing,
  }
}

/**
 * The set of transaction-specific evidence types a request demands, so a case
 * can be pre-populated / compared against. Mirrors chinaRouteGate's
 * transactional list.
 */
export function requiredEvidenceFor(request) {
  const need = []
  if (request.compliance && request.compliance.euCompliant) {
    need.push({ type: 'euCompliantProcessing', label: 'EU-compliant processing for the cross-border route' })
  }
  if (request.compliance && request.compliance.zeroDataRetention) {
    need.push({ type: 'zeroDataRetention', label: 'zero-data-retention evidence on the route' })
  }
  if (Array.isArray(request.compliance && request.compliance.certifications) && request.compliance.certifications.length > 0) {
    need.push({ type: 'certifications', label: 'requested certifications' })
  }
  return need
}

/**
 * Human approval gate over an eligibility decision record (SPEC §10.3, §10.5).
 * Ported verbatim from src/lib/eligibility.js. A Hold can never be silently
 * approved; 'request_docs' always downgrades to needsEvidence.
 */
export function applyEligibilityDecision(decision, action, opts = {}) {
  const now = opts.now || new Date().toISOString()
  const reviewer = opts.reviewer || decision.pendingReviewer || 'A. Novak'

  switch (action) {
    case 'approve':
      if (decision.status === 'hold') {
        return { ...decision, note: 'Hold requires condition resolution, not a direct approval.' }
      }
      return { ...decision, status: 'approvedByReviewer', reviewer, reviewedAt: now, docsRequested: false }
    case 'request_docs':
      return { ...decision, status: 'needsEvidence', docsRequested: true, requestedAt: now }
    default:
      return decision
  }
}

/** Convenience: has this decision passed the gate (may progress)? */
export function isPassed(decision) {
  return decision.status === 'preScreened' || decision.status === 'approvedByReviewer'
}
