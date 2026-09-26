// src/lib/operator.js
// Operator-console helpers for the Sovereign Grid frontend (Wave F, SPEC §9/§10/§12/§19).
//
// Everything here is a thin layer over the live API (src/lib/api.js) PLUS pure
// decision logic. The API client throws on HTTP error; every async helper in
// this file NORMALISES failures into a { ok:false, error, code, offline } result
// so screens render an inline error instead of crashing. No raw throw ever
// escapes to a component render/event handler.
//
// RBAC note: the UI only hides/disables controls; the server is the real
// authority (requireRole('operator')). This layer never fabricates privileges.

/** Role facts derived from the (auth.js) user profile. Pure — fully testable. */
export function roleInfo(user) {
  const role = (user && user.role) || null
  return {
    user: user || null,
    role,
    isAuthenticated: Boolean(user),
    isOperator: role === 'operator',
    isBuyer: role === 'buyer',
    isSeller: role === 'seller',
  }
}

/** Human-approval identity shown on decisions (SPEC §19 named human gates). */
export function operatorLabel(user) {
  if (!user) return 'Unknown operator'
  return user.displayName || user.email || user.role || 'Operator'
}

/** Timestamp rendered alongside a human-approval decision. */
export function decisionStamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Fee policy (§9) — GET /api/fees/policy, PUT /api/fees/policy (operator only)
// ---------------------------------------------------------------------------

function num(n, fallback, lo, hi) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}

/** Normalise free-form policy edits into the exact PUT payload the server parses. */
export function buildFeePolicyPayload(p = {}) {
  return {
    platformFee: num(p.platformFee, 0.08, 0, 1),
    feeBasis: p.feeBasis === 'perHr' ? 'perHr' : 'pct',
    feePayer: ['buyer', 'seller', 'split'].includes(p.feePayer) ? p.feePayer : 'buyer',
    splitPct: num(p.splitPct, 50, 0, 100),
    partnerSplitPct: num(p.partnerSplitPct, 30, 0, 100),
    minMarginPct: num(p.minMarginPct, 8, 0, 100),
  }
}

/** GET current policy -> { ok, data:{policy}, error, offline } (never throws). */
export async function fetchFeePolicy({ token } = {}) {
  try {
    const data = await apiGet('/fees/policy', token)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, data: null, error: err.message || 'Could not load fee policy', code: err.code, offline: isOffline(err) }
  }
}

/** PUT policy -> { ok, data, error, code, offline } (never throws). */
export async function saveFeePolicy(payload, { token } = {}) {
  try {
    const data = await apiPut('/fees/policy', buildFeePolicyPayload(payload), token)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, data: null, error: err.message || 'Could not save fee policy', code: err.code, offline: isOffline(err) }
  }
}

// ---------------------------------------------------------------------------
// Eligibility cases (§10) — approve / reject / attach evidence (operator only)
// ---------------------------------------------------------------------------

export const CASE_STATUS_LABELS = {
  open: 'Open',
  conditional: 'Conditional',
  approved: 'Approved',
  rejected: 'Rejected',
}

export async function approveEligibilityCase(id, { token } = {}) {
  try {
    const data = await apiPost(`/eligibility/cases/${id}/approve`, token)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message || 'Could not approve case', code: err.code, data: err.data, offline: isOffline(err) }
  }
}

export async function rejectEligibilityCase(id, { token } = {}) {
  try {
    const data = await apiPost(`/eligibility/cases/${id}/reject`, token)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message || 'Could not reject case', code: err.code, offline: isOffline(err) }
  }
}

/** Attach evidence to a case -> /api/eligibility/cases/:id/evidence (PATCH). */
export async function attachEligibilityEvidence(id, entry, { token } = {}) {
  try {
    const data = await apiPatch(`/eligibility/cases/${id}/evidence`, entry, token)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message || 'Could not attach evidence', code: err.code, offline: isOffline(err) }
  }
}

// ---------------------------------------------------------------------------
// Deal lifecycle (§12) — status advance via PATCH /api/deals/:id/status
// ---------------------------------------------------------------------------

export const DEAL_STATUS_LABELS = {
  negotiating: 'Negotiating',
  commercially_agreed: 'Commercially agreed',
  conditionally_awarded: 'Conditionally awarded',
  contracted: 'Contracted',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

// Forward-only transition map (SPEC §12 lifecycle). Constrained on the client
// so the operator can only advance; the server still enforces role + enum.
export const DEAL_TRANSITIONS = {
  negotiating: ['commercially_agreed', 'cancelled'],
  commercially_agreed: ['conditionally_awarded', 'cancelled'],
  conditionally_awarded: ['contracted', 'cancelled'],
  contracted: ['delivered', 'cancelled'],
  delivered: ['completed'],
  cancelled: [],
  completed: [],
}

export function allowedTransitions(status) {
  return DEAL_TRANSITIONS[status] || []
}

/** Validate a status move before sending it. Returns { ok, error? }. */
export function canTransitionDeal(current, next) {
  if (!DEAL_STATUS_LABELS[next]) {
    return { ok: false, error: `"${next}" is not a recognised deal status.` }
  }
  if (!current || current === next) {
    return { ok: false, error: `Deal is already ${DEAL_STATUS_LABELS[next] || next}.` }
  }
  const allowed = allowedTransitions(current)
  if (!allowed.includes(next)) {
    const list = allowed.length ? allowed.map((s) => DEAL_STATUS_LABELS[s]).join(', ') : 'no further stage'
    return { ok: false, error: `Cannot move deal from ${DEAL_STATUS_LABELS[current] || current} to ${DEAL_STATUS_LABELS[next]}. Valid next: ${list}.` }
  }
  return { ok: true }
}

/** PATCH /api/deals/:id/status -> { ok, data, error, code, offline } (never throws). */
export async function advanceDealStatus(id, status, { token } = {}) {
  try {
    const data = await apiPatch(`/deals/${id}/status`, { status }, token)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message || 'Could not update deal status', code: err.code, offline: isOffline(err) }
  }
}

// ---------------------------------------------------------------------------
// Listing review queue (§ listing gate) — operator approves/rejects
// ---------------------------------------------------------------------------

export const LISTING_PENDING = 'pending'

/** GET /api/listings?status=pending -> the operator review queue (never throws). */
export async function fetchPendingListings({ token } = {}) {
  try {
    const data = await apiGet('/listings?status=pending', token)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, data: null, error: err.message || 'Could not load review queue', code: err.code, offline: isOffline(err) }
  }
}

/**
 * PATCH /api/listings/:id/status -> { status: 'active' | 'rejected' }.
 * Operator-only on the server; returns { ok, data, error, code, offline }.
 */
export async function setListingStatus(id, status, { token } = {}) {
  try {
    const data = await apiPatch(`/listings/${id}/status`, { status }, token)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.message || 'Could not update listing status', code: err.code, offline: isOffline(err) }
  }
}

// ---------------------------------------------------------------------------
// small fetch helpers bound to the api client
// ---------------------------------------------------------------------------
import { api } from './api.js'

function isOffline(err) {
  return Boolean(err && (err.network || err.timeout))
}
const apiGet = (path, token) => api.get(path, { token })
const apiPut = (path, body, token) => api.put(path, body, { token })
const apiPost = (path, token) => api.post(path, undefined, { token })
const apiPatch = (path, body, token) => api.patch(path, body, { token })
