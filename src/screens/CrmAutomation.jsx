// src/screens/CrmAutomation.jsx — CRM Automation (D10, SPEC §13, §16.3 screen 10)
import { useMarket } from '../store/MarketContext.jsx'
import { canSendMessage, messageSendBlockReason } from '../lib/deal.js'
import { DemoBadge } from './ui.jsx'

const PRIORITY_STYLES = {
  critical: 'bg-[color:var(--sg-danger)] text-white',
  high: 'bg-[color:var(--sg-warning)] text-white',
  medium: 'bg-accent text-white',
  low: 'bg-elevated text-text-3',
}

const STATUS_STYLES = {
  sent: 'bg-[color:var(--sg-success-dim)] text-success',
  approved: 'bg-[color:var(--sg-success-dim)] text-success',
  rejected: 'bg-[color:var(--sg-danger-dim)] text-danger',
  pending_approval: 'bg-[color:var(--sg-warning-dim)] text-warning',
  scheduled: 'bg-elevated text-text-3',
}

function StatusPill({ msg }) {
  const label = msg.requiresApproval && !msg.approved ? (msg.status === 'rejected' ? 'rejected' : 'needs approval') : msg.status
  return <span className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLES[msg.status] || 'bg-elevated text-text-3'}`}>{label}</span>
}

export default function CrmAutomation() {
  const { crm, approveCrmMessage, rejectCrmMessage } = useMarket()

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-text-3">Automation view — DEMO generated outreach. Sensitive/binding sends require approval (SPEC §13.3).</span>
      </div>
      <h1 className="sg-display text-2xl">CRM Automation — {crm.dealName}</h1>
      <p className="mt-1 max-w-3xl text-sm text-text-2">
        {crm.contact}. Sovereign Grid integrates with an established CRM and owns the compute-specific opportunity,
        matching, evidence and transaction objects (SPEC §13.1).
      </p>

      {/* Outreach sequence */}
      <section className="sg-card mt-6 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Generated outreach sequence</h2>
        <p className="mb-3 text-xs text-text-3">Each message records template, source data, recipient and status — and the responsible human for any approval (SPEC §13.3).</p>
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
      <section className="sg-card mt-6 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Follow-up triggers (SPEC §13.2)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {crm.followUpTriggers.map((t) => (
            <div key={t.id} className="rounded-md border border-[color:var(--sg-border)] bg-elevated p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-text-1">{t.label}</span>
                <PriorityBadge p={t.priority} />
              </div>
              <p className="mt-1 text-xs text-text-2">{t.detail}</p>
              <p className="mt-1 text-[11px] text-text-4">due {t.due}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Operator inbox */}
      <section className="sg-card mt-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Operator inbox — merged queue (SPEC §13.4)</h2>
          <span className="rounded bg-elevated px-2 py-0.5 text-xs text-text-3">{crm.operatorInbox.length} items</span>
        </div>
        <p className="mb-3 mt-1 text-xs text-text-3">One prioritized queue: revenue, stalled deals, expiring evidence, screening holds, margin exceptions, renewals, delivery risks.</p>
        <ul className="divide-y divide-[color:var(--sg-border)]">
          {crm.operatorInbox.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <PriorityBadge p={item.priority} />
                <span className="text-sm font-medium text-text-1">{item.label}</span>
                <span className="truncate text-xs text-text-3">{item.detail}</span>
              </div>
              <span className="shrink-0 text-[11px] text-text-4">due {item.due}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function EmailCard({ msg, blocked, blockReason, onApprove, onReject }) {
  return (
    <div className={`sg-card p-3.5 ${blocked ? 'border-[color:var(--sg-warning)] bg-[color:var(--sg-warning-dim)]' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] font-semibold text-text-3">step {msg.step}</span>
            <span className="text-sm font-semibold text-text-1">{msg.title}</span>
            <StatusPill msg={msg} />
          </div>
          <div className="mt-0.5 text-xs text-text-3">
            Template: <b className="text-text-2">{msg.template}</b> · To: {msg.to}
            {msg.sentAt ? ` · sent ${msg.sentAt}` : msg.due ? ` · due ${msg.due}` : msg.draftAt ? ` · drafted ${msg.draftAt}` : ''}
          </div>
          <div className="mt-0.5 text-xs text-text-4">
            Source data: <i>{msg.source}</i>
          </div>
        </div>
      </div>

      {blocked && (
        <div className="mt-3 rounded-md border border-[color:var(--sg-warning)] bg-[color:var(--sg-warning-dim)] p-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-warning">⚠</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-warning">Blocked — approval required</div>
              <p className="text-xs text-warning">{blockReason}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onApprove}
                  className="sg-btn sg-btn--primary px-3 py-1 text-xs"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={onReject}
                  className="rounded-md border border-[color:var(--sg-danger)] bg-elevated px-3 py-1 text-xs font-semibold text-danger"
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
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_STYLES[p] || 'bg-elevated text-text-3'}`}>{p}</span>
}
