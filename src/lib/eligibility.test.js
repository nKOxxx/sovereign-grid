// src/lib/eligibility.test.js
import { describe, it, expect } from 'vitest'
import { applyEligibilityDecision, isPassed, OUTCOME_LABELS } from './eligibility.js'

const NOW = '2026-09-24T12:00:00.000Z'

describe('eligibility decision state transitions (SPEC §10.3, §10.5)', () => {
  it('approve promotes a pre-screened decision to approved-by-reviewer with a named reviewer + timestamp', () => {
    const d = applyEligibilityDecision({ status: 'preScreened', conditions: [] }, 'approve', { now: NOW, reviewer: 'R. Haddad' })
    expect(d.status).toBe('approvedByReviewer')
    expect(d.reviewer).toBe('R. Haddad')
    expect(d.reviewedAt).toBe(NOW)
    expect(d.docsRequested).toBe(false)
    expect(isPassed(d)).toBe(true)
  })

  it('request_docs downgrades a conditional decision to needs-evidence', () => {
    const d = applyEligibilityDecision({ status: 'conditional', conditions: ['Confirm EU data controls'] }, 'request_docs', { now: NOW })
    expect(d.status).toBe('needsEvidence')
    expect(d.docsRequested).toBe(true)
    expect(d.requestedAt).toBe(NOW)
    expect(isPassed(d)).toBe(false)
  })

  it('a Hold can never be silently approved — approving returns Hold unchanged', () => {
    const d = applyEligibilityDecision({ status: 'hold', conditions: ['Missing end-use evidence'] }, 'approve', { now: NOW, reviewer: 'E. Wu' })
    expect(d.status).toBe('hold')
    expect(d.reviewer).toBeUndefined()
    expect(d.note).toMatch(/condition resolution/i)
  })

  it('unknown action leaves the decision untouched', () => {
    const d = applyEligibilityDecision({ status: 'conditional' }, 'noop', { now: NOW })
    expect(d.status).toBe('conditional')
  })

  it('exposes the four screening states + approved label', () => {
    expect(OUTCOME_LABELS).toMatchObject({
      preScreened: 'Pre-screened',
      needsEvidence: 'Needs evidence',
      conditional: 'Conditional',
      hold: 'Hold',
      approvedByReviewer: 'Approved by reviewer',
    })
  })
})
