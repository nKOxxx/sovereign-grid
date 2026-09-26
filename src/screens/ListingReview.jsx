// src/screens/ListingReview.jsx — Operator listing review gate (Wave G3).
//
// Unreviewed listings enter the pool as 'pending' (POST /api/listings always
// stores pending — see server/src/routes/listings.js); this operator-only
// screen is where a human approves them into the live pool ('active') or
// rejects them ('rejected'). Approved rows become visible to the public
// marketplace and the buyer matching pool; rejected/pending rows never are.
//
// RBAC: the UI only hides the screen for non-operators; the server is the
// authority (PATCH /api/listings/:id/status is requireRole('operator'), and the
// ?status=pending queue is operator-only). House design system only: dark
// .sg-* tokens, zero light-theme Tailwind classes, custom Select, sg-num on
// figures. Guarded by src/screens/listing-review.test.jsx.
import { useCallback, useEffect, useState } from 'react'
import { DemoBadge, OfflineBadge } from './ui.jsx'
import { useRole } from '../lib/useRole.js'
import { getToken } from '../lib/auth.js'
import {
  fetchPendingListings,
  setListingStatus,
  operatorLabel,
} from '../lib/operator.js'

const fmtPrice = (l) => {
  const p = Number(l.on_demand_price ?? l.committed_price)
  return Number.isFinite(p) ? `$${p.toFixed(2)}` : '—'
}

/**
 * A single review-queue row. Exported separately so the design-guard SSR test
 * can assert the financial tells (sg-num) and button variants without waiting
 * on an async queue fetch.
 */
export function ReviewRow({ listing, onDecide, busy }) {
  return (
    <tr className="border-b border-[color:var(--sg-border)]">
      <td className="px-4 py-3 text-sm text-text-1">{listing.name}</td>
      <td className="px-4 py-3 text-sm text-text-2">{listing.region}</td>
      <td className="px-4 py-3 text-sm text-text-2">{listing.gpu_model}</td>
      <td className="px-4 py-3 text-sm">
        <span className="sg-num text-text-1">{fmtPrice(listing)}</span>
      </td>
      <td className="px-4 py-3">
        <span className="sg-pill sg-pill--accent">pending</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(listing, 'active')}
            className="sg-btn sg-btn--primary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(listing, 'rejected')}
            className="sg-btn bg-[color:var(--sg-danger)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function ListingReview() {
  const { isOperator, user } = useRole()
  const token = getToken()
  const [listings, setListings] = useState([])
  const [status, setStatus] = useState(token ? 'loading' : 'offline') // loading | live | offline
  const [busyId, setBusyId] = useState(null)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    if (!token) return
    const res = await fetchPendingListings({ token })
    if (res.ok && Array.isArray(res.data?.listings)) {
      setListings(res.data.listings)
      setStatus('live')
    } else {
      setStatus('offline')
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  async function decide(listing, next) {
    if (!token) return
    setErr(null)
    setBusyId(listing.id)
    // Optimistic: pull the row out of the pending queue immediately, then
    // reconcile against the server.
    setListings((cur) => cur.filter((l) => l.id !== listing.id))
    const res = await setListingStatus(listing.id, next, { token })
    if (!res.ok) {
      // Revert the optimistic removal on failure.
      setListings((cur) => [listing, ...cur])
      setErr(res.code === 'forbidden' ? 'Only an operator can review listings.' : res.error || 'Could not update listing status')
    }
    setBusyId(null)
  }

  // Non-operators never see the review queue (server also enforces 403).
  if (!isOperator) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-2 flex items-center gap-2">
          <DemoBadge label="OPERATOR ONLY" />
          <span className="text-xs text-text-3">Listing review gate.</span>
        </div>
        <section className="sg-card p-5">
          <h1 className="sg-display text-2xl">Listing review</h1>
          <p className="mt-2 text-sm text-text-2">
            This screen is restricted to {user ? `${user.role} accounts` : 'signed-in operators'}. Only an operator can approve or
            reject capacity listings before they reach the live pool.
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge label="LIVE API" />
        {status === 'offline' ? <OfflineBadge /> : <span className="text-xs text-text-3">Operator review queue — pending listings.</span>}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="sg-display text-2xl">Listing review</h1>
        <span className="text-xs text-text-4">Signed in as {operatorLabel(user)}</span>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-text-2">
        Approving a listing publishes it to the public marketplace and the matching pool; rejecting it keeps it out. Every
        transition is written to the immutable audit log.
      </p>

      {err && (
        <p className="mt-4 rounded-md border border-[color:var(--sg-danger)] bg-[color:var(--sg-danger-dim)] px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      <section className="sg-card mt-5 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[color:var(--sg-border-strong)] text-left text-[11px] font-semibold uppercase tracking-wide text-text-3">
              <th className="px-4 py-3">Listing</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">GPU</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {listings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center">
                  <p className="sg-display text-lg">Queue clear</p>
                  <p className="mt-1 text-sm text-text-3">No listings are awaiting review.</p>
                </td>
              </tr>
            ) : (
              listings.map((l) => (
                <ReviewRow
                  key={l.id}
                  listing={l}
                  busy={busyId === l.id}
                  onDecide={decide}
                />
              ))
            )}
          </tbody>
        </table>
      </section>
      <p className="mt-4 text-xs text-text-4">
        Only active listings are served to the public marketplace and matched to buyer requests.
      </p>
    </div>
  )
}
