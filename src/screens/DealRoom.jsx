// src/screens/DealRoom.jsx — Deal Room (D05, SPEC §12, §16.3 screen 8, §16.4)
import { useEffect, useState } from 'react'
import { useMarket } from '../store/MarketContext.jsx'
import { milestoneTracker, MILESTONE_LABELS, milestoneIndex } from '../lib/deal.js'
import { api } from '../lib/api.js'
import { getToken } from '../lib/auth.js'
import { DemoBadge, inputCls, OfflineBadge } from './ui.jsx'
import { useRole } from '../lib/useRole.js'
import {
  DEAL_STATUS_LABELS,
  allowedTransitions,
  canTransitionDeal,
  advanceDealStatus,
  operatorLabel,
  decisionStamp,
} from '../lib/operator.js'

const ROLE_STYLES = {
  buyer: { bg: 'bg-[color:var(--sg-accent-dim)]', border: 'border-[color:var(--sg-accent)]', name: 'text-accent', align: 'self-start' },
  seller: { bg: 'bg-[color:var(--sg-success-dim)]', border: 'border-[color:var(--sg-success)]', name: 'text-success', align: 'self-end' },
  operator: { bg: 'bg-elevated', border: 'border-[color:var(--sg-border)]', name: 'text-text-2', align: 'self-start' },
}

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function DealRoom() {
  const { connection, requestConnection, approveConnection, deal } = useMarket()

  // Lightweight live wiring: when authenticated, read the user's deals from the
  // API. The rich room composite (milestones/documents/eligibility) is not
  // served as one resource, so the seed room content stays the primary view and
  // we surface the live deal's own status/badges when available. Falls back to
  // seed on any failure (the Pages site has no backend).
  const [apiStatus, setApiStatus] = useState('offline') // 'live' | 'offline' | 'loading'
  const [liveDeals, setLiveDeals] = useState([])
  useEffect(() => {
    let active = true
    const token = getToken()
    if (!token) {
      setApiStatus('offline')
      return () => {
        active = false
      }
    }
    setApiStatus('loading')
    api
      .get('/deals', { token })
      .then((d) => {
        if (!active) return
        setLiveDeals(Array.isArray(d && d.deals) ? d.deals : [])
        setApiStatus('live')
      })
      .catch(() => {
        if (!active) return
        setLiveDeals([])
        setApiStatus('offline')
      })
    return () => {
      active = false
    }
  }, [])

  const liveFalcon = liveDeals.find((dl) => (dl.name || '').toLowerCase().includes('falcon'))

  if (connection.status !== 'approved') {
    return (
      <ConnectionGate
        status={connection.status}
        apiStatus={apiStatus}
        onRequest={() => requestConnection('eu-h200-nordics')}
        onApprove={approveConnection}
      />
    )
  }

  return <Room deal={deal} liveFalcon={liveFalcon} liveDeals={liveDeals} apiStatus={apiStatus} />
}

// ---------------------------------------------------------------------------
// Connection-request flow gate (SPEC §16.4): Request connection -> approval state
// ---------------------------------------------------------------------------
function ConnectionGate({ status, apiStatus, onRequest, onApprove }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-3 flex items-center gap-2">
        <DemoBadge />
        {apiStatus === 'offline' && <OfflineBadge />}
        {apiStatus === 'live' && (
          <span className="rounded bg-[color:var(--sg-success-dim)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-success">
            live API
          </span>
        )}
        <span className="text-xs text-text-3">Deal room — connection first, then deal room (SPEC §16.4).</span>
      </div>
      <h1 className="sg-display text-2xl">Deal Room — Project Falcon</h1>
      <p className="mt-2 text-sm text-text-2">
        Connecting buyer (Project Falcon) with seller <b>Nordic Vector Compute OY</b> for 256× H200, EU primary + UAE
        failover. The room is only opened after both parties approve the connection.
      </p>

      <div className="sg-card mt-6 p-6">
        {status === 'none' && (
          <div className="text-center">
            <p className="mb-4 text-sm text-text-2">No connection has been requested yet for this deal.</p>
            <button
              type="button"
              onClick={onRequest}
              className="sg-btn sg-btn--primary px-4 py-2 text-sm"
            >
              Request connection
            </button>
            <p className="mt-3 text-xs text-text-4">Demo: requesting opens the approval state below.</p>
          </div>
        )}

        {status === 'pending' && (
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[color:var(--sg-warning)]" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-warning">Connection request pending approval</h2>
              <span className="rounded bg-[color:var(--sg-warning-dim)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">demo</span>
            </div>
            <p className="mt-2 text-sm text-text-2">
              Request sent. Buyer and seller must both approve before the deal room (messages, documents, milestones) is
              opened. No sensitive material is visible until then.
            </p>
            <div className="mt-4 rounded-md border border-[color:var(--sg-warning)] bg-[color:var(--sg-warning-dim)] p-3 text-sm text-warning">
              <b>Approve to open the deal room</b> — demo represents both counterparties accepting the connection.
            </div>
            <button
              type="button"
              onClick={onApprove}
              className="sg-btn sg-btn--primary mt-4 px-4 py-2 text-sm"
            >
              Approve connection & open deal room
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deal room proper (connection approved)
// ---------------------------------------------------------------------------
function Room({ deal, liveFalcon, liveDeals, apiStatus }) {
  const { sendDealMessage } = useMarket()
  const [draft, setDraft] = useState('')

  const track = milestoneTracker(deal.milestones.current, deal.milestones.achieved)
  const currentIdx = milestoneIndex(deal.milestones.current)

  const postMessage = () => {
    if (!draft.trim()) return
    sendDealMessage({ from: 'buyer', text: draft })
    setDraft('')
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Header deal={deal} liveFalcon={liveFalcon} liveDeals={liveDeals} apiStatus={apiStatus} />

      {/* Milestone tracker (SPEC §12.2) */}
      <section className="sg-card mt-6 p-5">
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Transaction milestone</h2>
          <span className="rounded bg-[color:var(--sg-warning-dim)] px-2 py-0.5 text-xs font-semibold text-warning">
            Current: {MILESTONE_LABELS[deal.milestones.current]}
          </span>
        </div>
        <ol className="flex flex-wrap items-center gap-y-2">
          {track.map((m, i) => (
            <li key={m.name} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    m.status === 'done'
                      ? 'bg-[color:var(--sg-success)] text-white'
                      : m.status === 'current'
                        ? 'bg-accent text-white ring-2 ring-[color:var(--sg-accent-hover)]'
                        : 'bg-elevated text-text-4'
                  }`}
                >
                  {m.status === 'done' ? '✓' : i + 1}
                </span>
                <span
                  className={`whitespace-nowrap text-xs ${
                    m.status === 'current' ? 'font-semibold text-accent' : m.status === 'done' ? 'text-success' : 'text-text-3'
                  }`}
                >
                  {m.label}
                </span>
              </div>
              {i < track.length - 1 && <span className={`mx-1 h-px w-4 sm:w-6 ${i < currentIdx ? 'bg-[color:var(--sg-success)]' : 'bg-elevated'}`} />}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-text-3">
          Project Falcon is <b>Conditionally awarded</b>: contract, provisioning and settlement milestones remain. Deposit &
          invoice rows below are status-only — no custody, no payment processing in the demo (SPEC §12.3).
        </p>
      </section>

      <OperatorDealControls deal={deal} liveFalcon={liveFalcon} liveDeals={liveDeals} apiStatus={apiStatus} />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Left column: participants + offer + negotiation + deposits */}
        <div className="space-y-6 lg:col-span-1">
          <Participants deal={deal} />
          <OfferCard deal={deal} />
          <NegotiationCard deal={deal} />
          <PaymentCard deal={deal} />
        </div>

        {/* Middle: message thread */}
        <div className="space-y-6 lg:col-span-1">
          <MessageThread deal={deal} />
          <div className="sg-card p-3">
            <textarea
              className={inputCls}
              rows={2}
              value={draft}
              placeholder="Post a message as the buyer (demo)"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              onClick={postMessage}
              className="sg-btn sg-btn--primary mt-2 px-3 py-1.5 text-sm"
            >
              Send
            </button>
          </div>
        </div>

        {/* Right column: documents + tasks + eligibility */}
        <div className="space-y-6 lg:col-span-1">
          <DocumentsCard deal={deal} />
          <TasksCard deal={deal} />
          <EligibilityCard deal={deal} />
        </div>
      </div>
    </div>
  )
}

function Header({ deal, liveFalcon, liveDeals, apiStatus }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <DemoBadge />
      {apiStatus === 'offline' && <OfflineBadge />}
      {apiStatus === 'live' && (
        <span className="rounded bg-[color:var(--sg-success-dim)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-success">
          live deals: {Array.isArray(liveDeals) ? liveDeals.length : 0}
        </span>
      )}
      <span className="text-xs text-text-3">Deal room — DEMO content. Statuses only; no live transaction.</span>
      {liveFalcon && apiStatus === 'live' && (
        <span className="rounded bg-elevated px-2 py-0.5 text-[11px] text-text-3">
          live Falcon deal: {liveFalcon.status || '—'}
        </span>
      )}
      <span className="ml-auto rounded bg-[color:var(--sg-warning-dim)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
        negotiation: {deal.offer.status}
      </span>
    </div>
  )
}

function Section({ title, right, children }) {
  return (
    <section className="sg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-3">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

function Participants({ deal }) {
  return (
    <Section
      title="Participants & permissions"
      right={<span className="text-[10px] text-text-4">{deal.participants.length} parties</span>}
    >
      <ul className="space-y-2">
        {deal.participants.map((p) => (
          <li key={p.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-accent" />
            <div>
              <div className="font-medium text-text-1">
                {p.role} <span className="text-xs font-normal text-text-4">· {p.identity}</span>
              </div>
              <div className="text-xs text-text-3">{p.contact}</div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function OfferCard({ deal }) {
  const o = deal.offer
  return (
    <Section title="Selected offer & quote">
      <div className="text-sm">
        <div className="font-medium text-text-1">{o.selected}</div>
        <div className="text-xs text-text-3">
          Quote <b>{o.quoteVersion}</b> · {o.quoteDate}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <dt className="text-text-3">Committed (USD/hr)</dt>
          <dd className="sg-num text-right font-semibold text-text-1">{o.committedPerAccelHr.toFixed(2)}</dd>
          <dt className="text-text-3">On-demand (USD/hr)</dt>
          <dd className="sg-num text-right text-text-1">{o.onDemandPerAccelHr.toFixed(2)}</dd>
          <dt className="text-text-3">Accelerators</dt>
          <dd className="text-right text-text-1">{o.count}× H200</dd>
          <dt className="text-text-3">Term</dt>
          <dd className="text-right text-text-1">{o.termMonths} months</dd>
        </dl>
      </div>
    </Section>
  )
}

function NegotiationCard({ deal }) {
  return (
    <Section title="Negotiation state">
      <p className="text-sm text-text-2">{deal.negotiation.state}</p>
      {deal.negotiation.approvedDeviations.map((d) => (
        <div key={d.id} className="mt-3 rounded-md border border-[color:var(--sg-border)] bg-elevated p-2.5 text-xs">
          <div className="font-semibold text-text-1">{d.item}</div>
          <p className="text-text-2">{d.detail}</p>
          <p className="mt-1 text-text-4">
            Approved deviation · {d.approver} · {d.approvedAt}
          </p>
        </div>
      ))}
    </Section>
  )
}

function PaymentCard({ deal }) {
  return (
    <Section
      title="Deposit & invoices (status only)"
      right={<span className="rounded bg-elevated px-1.5 py-0.5 text-[10px] text-text-3">no custody</span>}
    >
      <div className="flex items-center justify-between rounded-md border border-[color:var(--sg-border)] bg-elevated px-3 py-2 text-sm">
        <span className="text-text-2">Deposit</span>
        <span className="font-semibold capitalize text-text-1">{deal.deposit.status.replace('_', ' ')}</span>
      </div>
      <p className="mt-2 text-xs text-text-3">{deal.deposit.note}</p>
      <ul className="mt-3 space-y-2">
        {deal.invoices.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between rounded-md border border-[color:var(--sg-border)] px-3 py-2 text-sm">
            <div>
              <div className="text-text-2">{inv.label}</div>
              <div className="text-xs text-text-4">{inv.note}</div>
            </div>
            <span className="ml-2 shrink-0 rounded bg-[color:var(--sg-warning-dim)] px-2 py-0.5 text-xs font-semibold capitalize text-warning">
              {inv.status}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function MessageThread({ deal }) {
  return (
    <Section
      title="Message thread"
      right={<span className="text-[10px] text-text-4">structured · buyer / seller / operator</span>}
    >
      <div className="space-y-3">
        {deal.messages.map((m) => {
          const s = ROLE_STYLES[m.from] || ROLE_STYLES.operator
          return (
            <div key={m.id} className={`max-w-[92%] rounded-lg border px-3 py-2 ${s.bg} ${s.border} ${s.align}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold capitalize ${s.name}`}>{m.from}</span>
                <span className="text-[10px] text-text-4">{fmtDate(m.at)}</span>
              </div>
              <p className="mt-0.5 text-sm text-text-1">{m.text}</p>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function DocumentsCard({ deal }) {
  const received = deal.documents.filter((d) => d.received).length
  return (
    <Section title="Documents checklist" right={<span className="text-[10px] text-text-4">{received}/{deal.documents.length} received</span>}>
      <ul className="space-y-1.5">
        {deal.documents.map((d) => (
          <li key={d.id} className="flex items-start justify-between gap-2 text-sm">
            <div className="min-w-0">
              <div className="truncate text-text-2">{d.name}</div>
              {!d.received && d.note && <div className="text-xs text-text-4">{d.note}</div>}
            </div>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                d.received ? 'bg-[color:var(--sg-success-dim)] text-success' : 'bg-[color:var(--sg-warning-dim)] text-warning'
              }`}
            >
              {d.received ? 'received' : 'requested'}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function TasksCard({ deal }) {
  return (
    <Section title="Tasks">
      <ul className="space-y-1.5">
        {deal.tasks.map((t) => (
          <li key={t.id} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                t.status === 'done' ? 'bg-[color:var(--sg-success)]' : t.status === 'open' ? 'bg-[color:var(--sg-warning)]' : 'bg-elevated'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-text-2">{t.label}</div>
              <div className="text-xs text-text-4">
                Owner: {t.owner} · due {t.due}
              </div>
            </div>
            <span className="shrink-0 text-xs capitalize text-text-3">{t.status}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function EligibilityCard({ deal }) {
  const met = deal.eligibility.conditions.filter((c) => c.met).length
  return (
    <Section
      title="Eligibility conditions"
      right={<span className="rounded bg-[color:var(--sg-warning-dim)] px-1.5 py-0.5 text-[10px] font-semibold text-warning">conditional</span>}
    >
      <p className="mb-2 text-xs text-text-3">
        {met}/{deal.eligibility.conditions.length} conditions met. Pre-screening only — not legal advice (SPEC §10.1).
      </p>
      <ul className="space-y-1.5">
        {deal.eligibility.conditions.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${c.met ? 'bg-[color:var(--sg-success)]' : 'bg-[color:var(--sg-danger)]'}`} />
            <span className="text-text-2">{c.label}</span>
            {c.pending && <span className="ml-auto shrink-0 rounded bg-[color:var(--sg-danger-dim)] px-1.5 py-0.5 text-[10px] font-semibold text-danger">open</span>}
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Operator deal controls (SPEC §12): advance a deal's status via PATCH
// /api/deals/:id/status, constrained to forward-only transitions. Invalid or
// illegal moves render a friendly inline error (never crash); every operator
// action is reflected in the audit-trail event log with the named human
// operator + timestamp (SPEC §19). Server enforces role — UI only gates.
// ---------------------------------------------------------------------------
function dealStatusOf(deal, liveFalcon, apiStatus) {
  if (apiStatus === 'live' && liveFalcon && liveFalcon.status) return liveFalcon.status
  const m = deal && deal.milestones && deal.milestones.current
  return m || 'negotiating'
}

function buildSeedEvents(deal, liveFalcon, apiStatus) {
  const ev = []
  if (deal && deal.negotiation && Array.isArray(deal.negotiation.approvedDeviations)) {
    for (const d of deal.negotiation.approvedDeviations) {
      ev.push({ id: 'ev-' + d.id, at: d.approvedAt, actor: d.approver || 'Operator', text: `Approved deviation: ${d.item}` })
    }
  }
  if (apiStatus === 'live' && liveFalcon && liveFalcon.status) {
    ev.unshift({
      id: 'ev-live',
      at: liveFalcon.updated_at || null,
      actor: 'Operator',
      text: `Deal status: ${DEAL_STATUS_LABELS[liveFalcon.status] || liveFalcon.status}`,
    })
  } else if (deal && deal.milestones && Array.isArray(deal.milestones.achieved)) {
    for (const a of deal.milestones.achieved) {
      if (DEAL_STATUS_LABELS[a]) ev.push({ id: 'ev-ms-' + a, at: null, actor: 'Operator', text: `Milestone reached: ${DEAL_STATUS_LABELS[a]}` })
    }
  }
  return ev
}

function OperatorDealControls({ deal, liveFalcon, liveDeals, apiStatus }) {
  const { isOperator, user } = useRole()
  const token = getToken()
  const [cur, setCur] = useState(() => dealStatusOf(deal, liveFalcon, apiStatus))
  const [events, setEvents] = useState(() => buildSeedEvents(deal, liveFalcon, apiStatus))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [okMsg, setOkMsg] = useState(null)

  if (!isOperator) return null

  const next = allowedTransitions(cur)
  const id = (liveFalcon && liveFalcon.id) || (deal && deal.id) || ''
  const currentLabel = DEAL_STATUS_LABELS[cur] || cur

  const onAdvance = async (to) => {
    const check = canTransitionDeal(cur, to)
    setErr(null)
    setOkMsg(null)
    if (!check.ok) {
      setErr(check.error)
      return
    }
    setBusy(true)
    let live = null
    if (token && id) live = await advanceDealStatus(id, to, { token }).catch(() => null)
    setBusy(false)
    const stamp = new Date().toISOString()
    setCur(to)
    const persisted = apiStatus === 'live' && live && live.ok
    setEvents((prev) => [
      {
        id: 'ev-' + Date.now(),
        at: stamp,
        actor: operatorLabel(user),
        text: `Advanced to ${DEAL_STATUS_LABELS[to]}${persisted ? ' (persisted)' : ' (applied locally)'}`,
      },
      ...prev,
    ])
    if (live && !live.ok) setErr(`${live.error} — applied locally (API offline).`)
    else setOkMsg(`Deal moved to ${DEAL_STATUS_LABELS[to]}.`)
  }

  return (
    <section className="sg-card mt-6 p-5" data-testid="operator-deal-controls">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Deal status — operator</h2>
        <span className="rounded bg-elevated px-2 py-0.5 text-[10px] font-semibold text-text-3">operator only</span>
        <span className="ml-auto rounded bg-[color:var(--sg-accent-dim)] px-2 py-0.5 text-xs font-semibold text-accent">Current: {currentLabel}</span>
      </div>
      <p className="text-xs text-text-3">
        Signed in as <b>{operatorLabel(user)}</b>. Advance the deal only to a valid next stage (SPEC §12); every change is
        recorded in the audit trail below.
      </p>

      {next.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {next.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onAdvance(s)}
              disabled={busy}
              className="sg-btn sg-btn--primary px-3 py-1.5"
            >
              {busy ? '…' : `→ ${DEAL_STATUS_LABELS[s]}`}
            </button>
          ))}
          {next.includes('cancelled') && (
            <button
              type="button"
              onClick={() => onAdvance('cancelled')}
              disabled={busy}
              className="border border-[color:var(--sg-danger)] bg-elevated px-3 py-1.5 font-semibold text-danger disabled:opacity-50"
            >
              Cancel deal
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-text-3">Deal is {currentLabel} (terminal) — no further transition is valid.</p>
      )}

      {err && <p className="mt-3 rounded border border-[color:var(--sg-danger)] bg-[color:var(--sg-danger-dim)] px-2 py-1 text-xs font-medium text-danger">{err}</p>}
      {okMsg && <p className="mt-3 rounded border border-[color:var(--sg-success)] bg-[color:var(--sg-success-dim)] px-2 py-1 text-xs font-medium text-success">{okMsg}</p>}

      <div className="mt-4 border-t border-[color:var(--sg-border)] pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-3">Audit trail</h3>
        <ul className="mt-2 space-y-1.5">
          {events.length === 0 && <li className="text-xs text-text-4">No recorded events yet.</li>}
          {events.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-2 text-xs text-text-2">
              <span>
                <b className="text-text-1">{e.actor}</b> — {e.text}
              </span>
              <span className="shrink-0 text-text-4">{decisionStamp(e.at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
