// src/lib/operator.test.js
// Unit tests for the operator-console helper layer (src/lib/operator.js).
// Environment: node. fetch is stubbed via vi.stubGlobal so no DOM/network.
// These pin the Wave F guarantees: role gating, error paths that return
// { ok:false, error } instead of throwing (no-crash), and constrained deal
// transitions with friendly inline messages.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  roleInfo,
  operatorLabel,
  decisionStamp,
  buildFeePolicyPayload,
  fetchFeePolicy,
  saveFeePolicy,
  approveEligibilityCase,
  rejectEligibilityCase,
  attachEligibilityEvidence,
  DEAL_STATUS_LABELS,
  allowedTransitions,
  canTransitionDeal,
  advanceDealStatus,
} from './operator.js'

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// RBAC role gating (SPEC §19) — the UI hides/disables on these facts
// ---------------------------------------------------------------------------
describe('roleInfo — RBAC gating', () => {
  it('operator role flags isOperator and isAuthenticated', () => {
    const r = roleInfo({ role: 'operator', email: 'op@sg.local', displayName: 'Dana X' })
    expect(r.isOperator).toBe(true)
    expect(r.isAuthenticated).toBe(true)
    expect(r.isBuyer).toBe(false)
    expect(r.isSeller).toBe(false)
    expect(r.role).toBe('operator')
  })

  it('buyer role flags isBuyer and hides operator controls', () => {
    const r = roleInfo({ role: 'buyer', email: 'b@x.com' })
    expect(r.isBuyer).toBe(true)
    expect(r.isOperator).toBe(false)
    expect(r.isSeller).toBe(false)
  })

  it('seller role flags isSeller', () => {
    const r = roleInfo({ role: 'seller' })
    expect(r.isSeller).toBe(true)
    expect(r.isOperator).toBe(false)
  })

  it('no user -> all role flags false (logged out)', () => {
    const r = roleInfo(null)
    expect(r.isAuthenticated).toBe(false)
    expect(r.isOperator).toBe(false)
    expect(r.isBuyer).toBe(false)
    expect(r.isSeller).toBe(false)
    expect(r.role).toBeNull()
  })
})

describe('operatorLabel — human-approval identity (SPEC §19 named gates)', () => {
  it('prefers displayName when present', () => {
    expect(operatorLabel({ role: 'operator', email: 'op@sg.local', displayName: 'Dana X' })).toBe('Dana X')
  })

  it('falls back to email then role', () => {
    expect(operatorLabel({ role: 'operator', email: 'op@sg.local' })).toBe('op@sg.local')
    expect(operatorLabel({ role: 'operator' })).toBe('operator')
    expect(operatorLabel(null)).toBe('Unknown operator')
  })

  it('decisionStamp renders dates and tolerates bad input', () => {
    expect(decisionStamp('2026-09-20T09:15:00Z')).toContain('2026')
    expect(decisionStamp(null)).toBe('')
    expect(decisionStamp('nonsense')).toBe('nonsense')
  })
})

// ---------------------------------------------------------------------------
// Fee policy (§9) — GET + PUT with no-crash error handling
// ---------------------------------------------------------------------------
describe('buildFeePolicyPayload', () => {
  it('normalises pct basis, payer and percent into the PUT shape', () => {
    const p = buildFeePolicyPayload({ platformFee: 0.12, feeBasis: 'pct', feePayer: 'split', splitPct: 40 })
    expect(p).toMatchObject({ platformFee: 0.12, feeBasis: 'pct', feePayer: 'split', splitPct: 40 })
  })

  it('clamps out-of-range values and fills defaults', () => {
    const p = buildFeePolicyPayload({ platformFee: 5, feePayer: 'bogus' })
    expect(p.platformFee).toBe(1) // clamped to max 1 (100%)
    expect(p.feePayer).toBe('buyer') // unknown -> default
    expect(p.feeBasis).toBe('pct')
  })
})

describe('fetchFeePolicy', () => {
  it('returns the parsed policy on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ policy: { platformFee: 0.08, feeBasis: 'pct' } })))
    const res = await fetchFeePolicy({ token: 't' })
    expect(res.ok).toBe(true)
    expect(res.data.policy.platformFee).toBe(0.08)
  })

  it('flags offline (network failure) without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const res = await fetchFeePolicy({ token: 't' })
    expect(res.ok).toBe(false)
    expect(res.offline).toBe(true)
    expect(res.error).toBeTruthy()
  })
})

describe('saveFeePolicy', () => {
  it('PUT persists and returns ok on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ policy: { platformFee: 0.1, feeBasis: 'pct', feePayer: 'buyer' } }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await saveFeePolicy({ platformFee: 0.1, feePayer: 'buyer' }, { token: 't' })
    expect(res.ok).toBe(true)
    expect(res.data.policy.platformFee).toBe(0.1)
    const [, opts] = fetchMock.mock.calls[0]
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body).platformFee).toBe(0.1)
  })

  it('returns inline error (no throw, no crash) on a 403 PUT failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'forbidden', message: 'Operator required' } }, { status: 403 })),
    )
    const res = await saveFeePolicy({ platformFee: 0.1 }, { token: 't' })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('forbidden')
    expect(res.error).toContain('Operator required')
  })
})

// ---------------------------------------------------------------------------
// Eligibility cases (§10) — approve / reject / evidence, no-crash
// ---------------------------------------------------------------------------
describe('eligibility case actions', () => {
  it('approve succeeds and returns the updated case', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ case: { id: 'c1', status: 'approved' } })))
    const res = await approveEligibilityCase('c1', { token: 't' })
    expect(res.ok).toBe(true)
    expect(res.data.case.status).toBe('approved')
  })

  it('approve surfaces 409 evidence_pending inline (never crashes)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { code: 'evidence_pending', message: 'Case still missing required evidence; cannot approve yet.' }, missing: ['zeroDataRetention'] },
          { status: 409 },
        ),
      ),
    )
    const res = await approveEligibilityCase('c1', { token: 't' })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('evidence_pending')
    expect(res.error).toMatch(/evidence/)
    expect(res.data.missing).toContain('zeroDataRetention')
  })

  it('reject returns the updated case on success and inline error on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ case: { id: 'c1', status: 'rejected' } })))
    const ok = await rejectEligibilityCase('c1', { token: 't' })
    expect(ok.ok).toBe(true)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 })))
    const bad = await rejectEligibilityCase('nope', { token: 't' })
    expect(bad.ok).toBe(false)
    expect(bad.code).toBe('not_found')
  })

  it('attach evidence posts type/issuer and reports failure without throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ case: { evidence: [{ type: 'euCompliantProcessing' }] } }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await attachEligibilityEvidence('c1', { type: 'euCompliantProcessing', issuer: 'Counsel' }, { token: 't' })
    expect(res.ok).toBe(true)
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/eligibility/cases/c1/evidence')

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const offline = await attachEligibilityEvidence('c1', { type: 'x' }, { token: 't' })
    expect(offline.ok).toBe(false)
    expect(offline.offline).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Deal transitions (§12) — constrained forward moves, friendly errors
// ---------------------------------------------------------------------------
describe('deal transition map', () => {
  it('exposes the canonical status labels', () => {
    expect(DEAL_STATUS_LABELS.negotiating).toBe('Negotiating')
    expect(DEAL_STATUS_LABELS.conditionally_awarded).toBe('Conditionally awarded')
  })

  it('only allows forward/cancellation moves from each stage', () => {
    expect(allowedTransitions('negotiating')).toEqual(['commercially_agreed', 'cancelled'])
    expect(allowedTransitions('conditionally_awarded')).toEqual(['contracted', 'cancelled'])
    expect(allowedTransitions('delivered')).toEqual(['completed'])
    expect(allowedTransitions('completed')).toEqual([])
    expect(allowedTransitions('cancelled')).toEqual([])
  })

  it('allows a valid forward transition', () => {
    const r = canTransitionDeal('negotiating', 'commercially_agreed')
    expect(r.ok).toBe(true)
  })

  it('rejects a skipped (non-adjacent) transition with a friendly message', () => {
    const r = canTransitionDeal('negotiating', 'contracted')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Cannot move deal')
    expect(r.error).toContain('Commercially agreed') // lists the valid next
  })

  it('rejects an unknown destination status', () => {
    const r = canTransitionDeal('negotiating', 'bogus')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not a recognised deal status')
  })

  it('rejects a no-op same-status move', () => {
    const r = canTransitionDeal('negotiating', 'negotiating')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('already Negotiating')
  })

  it('rejects a backward move', () => {
    const r = canTransitionDeal('completed', 'delivered')
    expect(r.ok).toBe(false)
  })
})

describe('advanceDealStatus — PATCH with no-crash error handling', () => {
  it('PATCHes the new status and returns ok on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ deal: { id: 'd1', status: 'commercially_agreed' } }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await advanceDealStatus('d1', 'commercially_agreed', { token: 't' })
    expect(res.ok).toBe(true)
    expect(res.data.deal.status).toBe('commercially_agreed')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('/deals/d1/status')
    expect(opts.method).toBe('PATCH')
    expect(JSON.parse(opts.body).status).toBe('commercially_agreed')
  })

  it('returns an inline error (never throws) on a 500 PATCH failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'server_error', message: 'Boom' } }, { status: 500 })))
    const res = await advanceDealStatus('d1', 'contracted', { token: 't' })
    expect(res.ok).toBe(false)
    expect(res.code).toBe('server_error')
    expect(res.error).toBeTruthy()
  })
})
