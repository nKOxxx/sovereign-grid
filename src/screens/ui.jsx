// src/screens/ui.jsx — small shared presentational helpers
export function DemoBadge({ label = 'DEMO DATA' }) {
  return (
    <span className="rounded bg-[color:var(--sg-warning-dim)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-warning">
      {label}
    </span>
  )
}

// Shown when a live-API fetch failed and the screen fell back to seed data.
export function OfflineBadge({ label = 'illustrative data — API offline' }) {
  return (
    <span
      title="Could not reach the live API; showing bundled seed data instead."
      className="rounded bg-elevated px-2 py-0.5 text-[11px] font-semibold tracking-wide text-text-3"
    >
      {label}
    </span>
  )
}

export function VerifiedPill({ listing }) {
  const l = listing || {}
  const hasEvidence = Array.isArray(l.evidence) && l.evidence.length > 0
  const status = l.verificationStatus || 'Unverified'
  const unverified = !hasEvidence || /^unverified$/i.test(status)
  if (unverified) {
    return (
      <span title="Seller-provided claim with no completed evidence review (SPEC §19.1)">
        <span className="rounded bg-elevated px-2 py-0.5 text-[11px] font-medium text-text-3">Unverified</span>
      </span>
    )
  }
  return (
    <span title="Claim backed by reviewed evidence">
      <span className="rounded bg-[color:var(--sg-success-dim)] px-2 py-0.5 text-[11px] font-medium text-success">{status}</span>
    </span>
  )
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-3">{label}</span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full rounded-md border border-[color:var(--sg-border)] bg-elevated px-3 py-2 text-sm text-text-1 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'
