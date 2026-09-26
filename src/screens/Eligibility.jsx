// src/screens/Eligibility.jsx — Eligibility Result (D08, SPEC §10)
import { useState } from 'react'
import { applyEligibilityDecision, OUTCOME_LABELS } from '../lib/eligibility.js'
import { sellerListings, goldenRequest, DEMO_NOTE } from '../data/seed.js'
import { DemoBadge } from './ui.jsx'
import { useRole } from '../lib/useRole.js'
import { getToken } from '../lib/auth.js'
import {
  CASE_STATUS_LABELS,
  approveEligibilityCase,
  rejectEligibilityCase,
  attachEligibilityEvidence,
  operatorLabel,
  decisionStamp,
} from '../lib/operator.js'

const byId = (id) => sellerListings.find((l) => l.id === id)

// Route-specific decision records for Project Falcon (SPEC §10.5). These are
// PRE-SCREENING results — never legal advice or an automatic legal clearance
// (SPEC §10.1, §19).
const DECISIONS = [
  {
    key: 'nordics',
    listing: byId('eu-h200-nordics'),
    status: 'preScreened',
    summary: 'EU primary — no identified match under configured checks; transaction-specific review may still be required.',
  },
  {
    key: 'anon-mi300x',
    listing: byId('eu-anon-mi300x'),
    status: 'needsEvidence',
    summary: 'Seller identity is masked; entity and end-use evidence are required before this EU alternative is bookable.',
  },
  {
    key: 'gcc-h200',
    listing: byId('gcc-h200'),
    status: 'conditional',
    conditions: [
      'Confirm UAE failover access-control evidence for zero-data-retention handling',
      'Confirm EU data-residency support across the primary route',
    ],
    summary: 'Strong candidate for the UAE failover role, but progression is conditional on the conditions below being satisfied.',
  },
  {
    key: 'cn-ascend910c',
    listing: byId('cn-ascend910c'),
    status: 'hold',
    summary:
      'China-route offer. Held: missing end-use evidence and expired trade-control documentation for this class of transaction. Route-specific review required — no blanket geography exclusion.',
  },
]

const APPROVED_RECORD = {
  listing: byId('eu-h200-nordics'),
  reviewer: 'R. Haddad (Compliance)',
  scope: 'End-use declaration + EU data-residency controls for Project Falcon primary route',
  timestamp: '2026-09-20T09:15:00Z',
  expiry: '2026-12-19',
  conditions: 'None outstanding for the primary route.',
}

const STATUS_STYLE = {
  preScreened: 'bg-[color:var(--sg-success-dim)] text-success',
  needsEvidence: 'bg-[color:var(--sg-warning-dim)] text-warning',
  conditional: 'bg-[color:var(--sg-accent-dim)] text-accent',
  hold: 'bg-[color:var(--sg-danger-dim)] text-danger',
  approvedByReviewer: 'bg-[color:var(--sg-success-dim)] text-success',
}

export default function Eligibility() {
  const [gate, setGate] = useState({ status: 'conditional', conditions: APPROVED_RECORD.conditions ? ['Confirm UAE failover access-control evidence'] : [], docsRequested: false })

  const approve = () => setGate((g) => applyEligibilityDecision(g, 'approve', { reviewer: 'R. Haddad (Compliance)' }))
  const requestDocs = () => setGate((g) => applyEligibilityDecision(g, 'request_docs'))

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-text-3">Pre-screening results for {goldenRequest.name} — not legal advice or legal clearance.</span>
      </div>
      <h1 className="sg-display text-2xl">Eligibility Result — {goldenRequest.name}</h1>
      <p className="mt-1 max-w-3xl text-sm text-text-2">
        Route-specific screening of candidate offers. Chinese capacity is included as eligible supply but every transaction
        carries its own evidence-driven decision (SPEC §10, D15).
      </p>

      {/* Decision records — all four states */}
      <div className="mt-6 space-y-3">
        {DECISIONS.map((d) => (
          <DecisionCard key={d.key} d={d} />
        ))}
      </div>

      {/* Approved by reviewer record (SPEC §10.3) */}
      <section className="mt-6 rounded-lg border border-[color:var(--sg-success)] bg-[color:var(--sg-success-dim)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-success">Approved by reviewer</h2>
          <span className="rounded bg-[color:var(--sg-success)] px-2.5 py-1 text-xs font-bold text-white">{APPROVED_RECORD.listing.name}</span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-success">Reviewer</dt><dd className="font-medium text-success">{APPROVED_RECORD.reviewer}</dd></div>
          <div><dt className="text-xs text-success">Scope</dt><dd className="font-medium text-success">{APPROVED_RECORD.scope}</dd></div>
          <div><dt className="text-xs text-success">Timestamp</dt><dd className="font-medium text-success">{APPROVED_RECORD.timestamp}</dd></div>
          <div><dt className="text-xs text-success">Expiry</dt><dd className="font-medium text-success">{APPROVED_RECORD.expiry}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-success">Conditions: {APPROVED_RECORD.conditions}</p>
      </section>

      {/* Human approval gate (SPEC §10.3, §10.4) */}
      <section className="sg-card mt-6 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Human approval gate — conditional award</h2>
        <p className="mt-1 text-sm text-text-2">
          The UAE failover offer (GulfGrid H200) is conditionally awarded. A reviewer must approve or request documents before it
          can progress. High-risk decisions retain an explicit human gate (SPEC §22).
        </p>
        <div className="mt-3 rounded-md border border-[color:var(--sg-border)] bg-elevated p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span>Current status:</span>
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[gate.status] || 'bg-elevated text-text-2'}`}>{OUTCOME_LABELS[gate.status]}</span>
            {gate.docsRequested && <span className="rounded bg-[color:var(--sg-warning-dim)] px-2 py-0.5 text-xs font-medium text-warning">docs requested</span>}
          </div>
          {gate.status === 'needsEvidence' && gate.docsRequested && (
            <p className="mt-2 text-xs text-warning">Documents have been requested; the offer is on hold pending evidence.</p>
          )}
          {gate.status === 'approvedByReviewer' && (
            <p className="mt-2 text-xs text-success">
              Approved by R. Haddad (Compliance) — scope: UAE failover access-control evidence for zero-data-retention handling.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={approve}
            className="sg-btn sg-btn--primary px-4 py-2 text-sm"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={requestDocs}
            className="rounded-md border border-[color:var(--sg-border)] bg-elevated px-4 py-2 text-sm font-semibold text-text-2"
          >
            Request docs
          </button>
        </div>
      </section>

      <OperatorCaseQueue />

      <p className="mt-4 text-xs text-text-4">
        {DEMO_NOTE} Pre-screening only — not legal clearance (SPEC §19, §22.1).
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Operator case queue (SPEC §10, §19): operator-only workflow over seeded
// cases. Approve / reject / attach evidence each display the named human
// operator + timestamp (the UI's mirror of the immutable audit trail). A live
// API call is attempted when a token exists; any failure surfaces inline and
// never crashes, and the local decision still applies on the offline demo.
// Server remains the authority — UI only hides/disables.
// ---------------------------------------------------------------------------
const SEED_CASES = [
  {
    id: 'case-nordics',
    listingName: 'Nordic H200 — Helsinki primary',
    status: 'approved', // pre-existing reviewer approval (SPEC §10.3)
    missing: [],
    evidence: [],
    decidedBy: 'R. Haddad (Compliance)',
    decidedAt: '2026-09-20T09:15:00Z',
  },
  {
    id: 'case-anon-mi300x',
    listingName: 'Anonymous MI300X cluster',
    status: 'conditional',
    missing: ['euCompliantProcessing', 'zeroDataRetention'],
    evidence: [],
    decidedBy: null,
    decidedAt: null,
  },
  {
    id: 'case-gcc-h200',
    listingName: 'GulfGrid H200 — Abu Dhabi (UAE failover)',
    status: 'conditional',
    missing: ['zeroDataRetention'],
    evidence: [],
    decidedBy: null,
    decidedAt: null,
  },
  {
    id: 'case-cn-ascend910c',
    listingName: 'Shenhua Ascend 910C — Shenzhen',
    status: 'conditional',
    missing: ['endUse', 'tradeControlDocs'],
    evidence: [],
    decidedBy: null,
    decidedAt: null,
  },
]

const CASE_STYLE = {
  open: 'bg-[color:var(--sg-accent-dim)] text-accent',
  conditional: 'bg-[color:var(--sg-warning-dim)] text-warning',
  approved: 'bg-[color:var(--sg-success-dim)] text-success',
  rejected: 'bg-[color:var(--sg-danger-dim)] text-danger',
}

function OperatorCaseQueue() {
  const { isOperator, user } = useRole()
  const token = getToken()
  const [cases, setCases] = useState(SEED_CASES)
  const [busy, setBusy] = useState(null)
  const [draft, setDraft] = useState({}) // caseId -> { type, issuer }

  if (!isOperator) return null

  const applyLocal = (id, patch) =>
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const onApprove = async (c) => {
    setBusy(c.id)
    let live = null
    if (token) live = await approveEligibilityCase(c.id, { token }).catch(() => null)
    setBusy(null)
    applyLocal(c.id, {
      status: 'approved',
      missing: [],
      decidedBy: operatorLabel(user),
      decidedAt: new Date().toISOString(),
      _note: live && !live.ok ? `${live.error}` : null,
    })
  }

  const onReject = async (c) => {
    setBusy(c.id)
    let live = null
    if (token) live = await rejectEligibilityCase(c.id, { token }).catch(() => null)
    setBusy(null)
    applyLocal(c.id, {
      status: 'rejected',
      decidedBy: operatorLabel(user),
      decidedAt: new Date().toISOString(),
      _note: live && !live.ok ? `${live.error}` : null,
    })
  }

  const onAttach = async (c) => {
    const d = draft[c.id] || {}
    const type = (d.type || '').trim()
    if (!type) return
    setBusy(c.id)
    let live = null
    if (token) {
      live = await attachEligibilityEvidence(c.id, { type, issuer: d.issuer || '' }).catch(() => null)
    }
    setBusy(null)
    applyLocal(c.id, {
      status: 'conditional',
      evidence: [...(c.evidence || []), { type, issuer: d.issuer || '' }],
      missing: (c.missing || []).filter((m) => m !== type),
      decidedBy: operatorLabel(user),
      decidedAt: new Date().toISOString(),
      _note: live && !live.ok ? `${live.error}` : null,
    })
    setDraft((prev) => ({ ...prev, [c.id]: { type: '', issuer: '' } }))
  }

  const setD = (id, patch) => setDraft((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))

  return (
    <section className="sg-card mt-6 p-5" data-testid="operator-case-queue">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Operator case queue</h2>
        <span className="rounded bg-elevated px-2 py-0.5 text-[10px] font-semibold text-text-3">operator only</span>
        <span className="ml-auto text-xs text-text-4">
          signed in as <b>{operatorLabel(user)}</b>
        </span>
      </div>

      <div className="space-y-3">
        {cases.map((c) => (
          <div key={c.id} className="rounded-lg border border-[color:var(--sg-border)] bg-elevated p-4" data-testid={`case-${c.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-text-1">{c.listingName}</div>
              <span className={`rounded px-2.5 py-1 text-xs font-bold ${CASE_STYLE[c.status] || 'bg-elevated text-text-2'}`}>
                {CASE_STATUS_LABELS[c.status] || c.status}
              </span>
            </div>

            {c.status === 'conditional' && c.missing.length > 0 && (
              <p className="mt-2 text-xs text-warning">Missing evidence: {c.missing.join(', ')}</p>
            )}
            {c.evidence.length > 0 && (
              <p className="mt-2 text-xs text-text-3">
                Evidence on file: {c.evidence.map((e) => `${e.type}${e.issuer ? ` (${e.issuer})` : ''}`).join(', ')}
              </p>
            )}

            {(c.decidedBy || c.decidedAt) && (
              <p className="mt-2 text-xs text-text-3">
                <span className="font-semibold">Decision by {c.decidedBy}</span> · {decisionStamp(c.decidedAt)}
              </p>
            )}
            {c._note && <p className="mt-1 text-xs text-danger">{c._note} — applied locally (demo/offline).</p>}

            {c.status !== 'approved' && c.status !== 'rejected' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className="w-48 rounded-md border border-[color:var(--sg-border)] bg-elevated px-2 py-1 text-sm"
                  placeholder="evidence type (e.g. zeroDataRetention)"
                  value={(draft[c.id] || {}).type || ''}
                  onChange={(e) => setD(c.id, { type: e.target.value })}
                  data-testid={`ev-type-${c.id}`}
                />
                <input
                  className="w-40 rounded-md border border-[color:var(--sg-border)] bg-elevated px-2 py-1 text-sm"
                  placeholder="issuer"
                  value={(draft[c.id] || {}).issuer || ''}
                  onChange={(e) => setD(c.id, { issuer: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => onAttach(c)}
                  disabled={busy === c.id}
                  className="rounded-md border border-[color:var(--sg-border)] bg-elevated px-3 py-1.5 text-sm font-medium text-text-2 disabled:opacity-50"
                >
                  Attach evidence
                </button>
                <button
                  type="button"
                  onClick={() => onApprove(c)}
                  disabled={busy === c.id}
                  className="sg-btn sg-btn--primary px-3 py-1.5 text-sm disabled:opacity-50"
                  data-testid={`approve-${c.id}`}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onReject(c)}
                  disabled={busy === c.id}
                  className="rounded-md border border-[color:var(--sg-danger)] bg-elevated px-3 py-1.5 text-sm font-semibold text-danger disabled:opacity-50"
                  data-testid={`reject-${c.id}`}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function DecisionCard({ d }) {
  const l = d.listing
  return (
    <div className="sg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-text-1">{l.name}</h3>
        <span className={`rounded px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[d.status]}`}>{OUTCOME_LABELS[d.status]}</span>
      </div>
      <p className="mt-1 text-sm text-text-2">
        {l.accelerator.model} · {l.facility.country} · {l.facility.region}
      </p>
      <p className="mt-2 text-sm text-text-2">{d.summary}</p>
      {d.conditions && d.conditions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {d.conditions.map((c) => (
            <li key={c} className="flex items-start gap-1.5 text-sm text-accent">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
