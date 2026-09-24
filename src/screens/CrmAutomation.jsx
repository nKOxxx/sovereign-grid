// src/screens/CrmAutomation.jsx — CRM Automation (D10, SPEC §13, §16.3 screen 10)
import { useMarket } from '../store/MarketContext.jsx'
import { canSendMessage, messageSendBlockReason } from '../lib/deal.js'
import { DemoBadge } from './ui.jsx'

const PRIORITY_STYLES = {
  critical: 'bg-rose-600 text-white',
  high: 'bg-amber-500 text-white',
  medium: 'bg-sky-500 text-white',
  low: 'bg-slate-400 text-white',
}

const STATUS_STYLES = {
  sent: 'bg-emerald-100 text-emerald-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  scheduled: 'bg-slate-100 text-slate-600',
}

function StatusPill({ msg }) {
  const label = msg.requiresApproval && !msg.approved ? (msg.status === 'rejected' ? 'rejected' : 'needs approval') : msg.status
  return <span className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLES[msg.status] || 'bg-slate-100 text-slate-600'}`}>{label}</span>
}

export default function CrmAutomation() {
  const { crm, approveCrmMessage, rejectCrmMessage } = useMarket()

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-slate-500">Automation view — DEMO generated outreach. Sensitive/binding sends require approval (SPEC §13.3).</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">CRM Automation — {crm.dealName}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {crm.contact}. Sovereign Grid integrates with an established CRM and owns the compute-specific opportunity,
        matching, evidence and transaction objects (SPEC §13.1).
      </p>

      {/* Outreach sequence */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Generated outreach sequence</h2>
        <p className="mb-3 text-xs text-slate-500">Each message records template, source data, recipient and status — and the responsible human for any approval (SPEC §13.3).</p>
        <div className="space-y-3">
          {crm.emails.map((msg) => (
            <EmailCard
              key={msg.id}
              msg={msg}
              blocked={!canSendMessage(msg)}
              blockReason={messageSendBlockReason(msg)}
              onApprove={() => approveCrmMessage(msg.id)}
              onReject={() => rejectCrmMessage(msg.id)}
            />
          ))}
        </div>
      </section>

      {/* Follow-up triggers */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Follow-up triggers (SPEC §13.2)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {crm.followUpTriggers.map((t) => (
            <div key={t.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800">{t.label}</span>
                <PriorityBadge p={t.priority} />
              </div>
              <p className="mt-1 text-xs text-slate-600">{t.detail}</p>
              <p className="mt-1 text-[11px] text-slate-400">due {t.due}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Operator inbox */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Operator inbox — merged queue (SPEC §13.4)</h2>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{crm.operatorInbox.length} items</span>
        </div>
        <p className="mb-3 mt-1 text-xs text-slate-500">One prioritized queue: revenue, stalled deals, expiring evidence, screening holds, margin exceptions, renewals, delivery risks.</p>
        <ul className="divide-y divide-slate-100">
          {crm.operatorInbox.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <PriorityBadge p={item.priority} />
                <span className="text-sm font-medium text-slate-800">{item.label}</span>
                <span className="truncate text-xs text-slate-500">{item.detail}</span>
              </div>
              <span className="shrink-0 text-[11px] text-slate-400">due {item.due}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function EmailCard({ msg, blocked, blockReason, onApprove, onReject }) {
  return (
    <div className={`rounded-lg border p-3.5 ${blocked ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">step {msg.step}</span>
            <span className="text-sm font-semibold text-slate-900">{msg.title}</span>
            <StatusPill msg={msg} />
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Template: <b className="text-slate-700">{msg.template}</b> · To: {msg.to}
            {msg.sentAt ? ` · sent ${msg.sentAt}` : msg.due ? ` · due ${msg.due}` : msg.draftAt ? ` · drafted ${msg.draftAt}` : ''}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            Source data: <i>{msg.source}</i>
          </div>
        </div>
      </div>

      {blocked && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-amber-600">⚠</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-900">Blocked — approval required</div>
              <p className="text-xs text-amber-800">{blockReason}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onApprove}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  className="rounded-md border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PriorityBadge({ p }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_STYLES[p] || 'bg-slate-300 text-white'}`}>{p}</span>
}
