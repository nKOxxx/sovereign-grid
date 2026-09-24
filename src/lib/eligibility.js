// src/lib/eligibility.js
// Eligibility / policy engine domain for the demo (SPEC §10). PURE functions.
//
// This is PRE-SCREENING logic only — never legal advice and never an automatic
// legal clearance (SPEC §10.1, §19, §22.1). It produces a structured decision
// record; high-risk outcomes (Hold, Conditional award) retain explicit human
// gates.

export const ELIGIBILITY_OUTCOMES = ['preScreened', 'needsEvidence', 'conditional', 'hold', 'approvedByReviewer']

export const OUTCOME_LABELS = {
  preScreened: 'Pre-screened',
  needsEvidence: 'Needs evidence',
  conditional: 'Conditional',
  hold: 'Hold',
  approvedByReviewer: 'Approved by reviewer',
}

/**
 * Human approval gate over an eligibility decision record (SPEC §10.3, §10.5).
 *   decision: { status, conditions:[], docsRequested, reviewer, reviewedAt, expiry }
 *   action  : 'approve' | 'request_docs'
 *   opts    : { now, reviewer } for deterministic testing.
 * Rules:
 *   - A Hold can never be silently approved -> approving returns Hold unchanged
 *     (a Hold needs condition resolution, not a direct approval).
 *   - 'request_docs' always downgrades to needsEvidence + docsRequested.
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

/** Convenience: does this decision pass the gate (i.e. may progress)? */
export function isPassed(decision) {
  return decision.status === 'preScreened' || decision.status === 'approvedByReviewer'
}
