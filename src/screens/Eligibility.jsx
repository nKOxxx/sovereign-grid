// src/screens/Eligibility.jsx — Eligibility Result (D08, SPEC §10)
import { useState } from 'react'
import { applyEligibilityDecision, OUTCOME_LABELS } from '../lib/eligibility.js'
import { sellerListings, goldenRequest, DEMO_NOTE } from '../data/seed.js'
import { DemoBadge } from './ui.jsx'

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
  preScreened: 'bg-emerald-100 text-emerald-800',
  needsEvidence: 'bg-amber-100 text-amber-800',
  conditional: 'bg-sky-100 text-sky-800',
  hold: 'bg-rose-100 text-rose-800',
  approvedByReviewer: 'bg-emerald-100 text-emerald-800',
}

export default function Eligibility() {
  const [gate, setGate] = useState({ status: 'conditional', conditions: APPROVED_RECORD.conditions ? ['Confirm UAE failover access-control evidence'] : [], docsRequested: false })

  const approve = () => setGate((g) => applyEligibilityDecision(g, 'approve', { reviewer: 'R. Haddad (Compliance)' }))
  const requestDocs = () => setGate((g) => applyEligibilityDecision(g, 'request_docs'))

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-slate-500">Pre-screening results for {goldenRequest.name} — not legal advice or legal clearance.</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Eligibility Result — {goldenRequest.name}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
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
      <section className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-emerald-900">Approved by reviewer</h2>
          <span className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">{APPROVED_RECORD.listing.name}</span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-emerald-700">Reviewer</dt><dd className="font-medium text-emerald-900">{APPROVED_RECORD.reviewer}</dd></div>
          <div><dt className="text-xs text-emerald-700">Scope</dt><dd className="font-medium text-emerald-900">{APPROVED_RECORD.scope}</dd></div>
          <div><dt className="text-xs text-emerald-700">Timestamp</dt><dd className="font-medium text-emerald-900">{APPROVED_RECORD.timestamp}</dd></div>
          <div><dt className="text-xs text-emerald-700">Expiry</dt><dd className="font-medium text-emerald-900">{APPROVED_RECORD.expiry}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-emerald-700">Conditions: {APPROVED_RECORD.conditions}</p>
      </section>

      {/* Human approval gate (SPEC §10.3, §10.4) */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Human approval gate — conditional award</h2>
        <p className="mt-1 text-sm text-slate-600">
          The UAE failover offer (GulfGrid H200) is conditionally awarded. A reviewer must approve or request documents before it
          can progress. High-risk decisions retain an explicit human gate (SPEC §22).
        </p>
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span>Current status:</span>
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[gate.status] || 'bg-slate-100 text-slate-700'}`}>{OUTCOME_LABELS[gate.status]}</span>
            {gate.docsRequested && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">docs requested</span>}
          </div>
          {gate.status === 'needsEvidence' && gate.docsRequested && (
            <p className="mt-2 text-xs text-amber-700">Documents have been requested; the offer is on hold pending evidence.</p>
          )}
          {gate.status === 'approvedByReviewer' && (
            <p className="mt-2 text-xs text-emerald-700">
              Approved by R. Haddad (Compliance) — scope: UAE failover access-control evidence for zero-data-retention handling.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={approve}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={requestDocs}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Request docs
          </button>
        </div>
      </section>

      <p className="mt-4 text-xs text-slate-400">
        {DEMO_NOTE} Pre-screening only — not legal clearance (SPEC §19, §22.1).
      </p>
    </div>
  )
}

function DecisionCard({ d }) {
  const l = d.listing
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">{l.name}</h3>
        <span className={`rounded px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[d.status]}`}>{OUTCOME_LABELS[d.status]}</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {l.accelerator.model} · {l.facility.country} · {l.facility.region}
      </p>
      <p className="mt-2 text-sm text-slate-700">{d.summary}</p>
      {d.conditions && d.conditions.length > 0 && (
        <ul className="mt-2 space-y-1">
          {d.conditions.map((c) => (
            <li key={c} className="flex items-start gap-1.5 text-sm text-sky-800">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
