// src/screens/DealRoom.jsx — Deal Room (D05, SPEC §12, §16.3 screen 8, §16.4)
import { useEffect, useState } from 'react'
import { useMarket } from '../store/MarketContext.jsx'
import { milestoneTracker, MILESTONE_LABELS, milestoneIndex } from '../lib/deal.js'
import { api } from '../lib/api.js'
import { getToken } from '../lib/auth.js'
import { DemoBadge, inputCls, OfflineBadge } from './ui.jsx'

const ROLE_STYLES = {
  buyer: { bg: 'bg-sky-50', border: 'border-sky-200', name: 'text-sky-800', align: 'self-start' },
  seller: { bg: 'bg-emerald-50', border: 'border-emerald-200', name: 'text-emerald-800', align: 'self-end' },
  operator: { bg: 'bg-slate-100', border: 'border-slate-200', name: 'text-slate-700', align: 'self-start' },
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
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-700">
            live API
          </span>
        )}
        <span className="text-xs text-slate-500">Deal room — connection first, then deal room (SPEC §16.4).</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Deal Room — Project Falcon</h1>
      <p className="mt-2 text-sm text-slate-600">
        Connecting buyer (Project Falcon) with seller <b>Nordic Vector Compute OY</b> for 256× H200, EU primary + UAE
        failover. The room is only opened after both parties approve the connection.
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        {status === 'none' && (
          <div className="text-center">
            <p className="mb-4 text-sm text-slate-600">No connection has been requested yet for this deal.</p>
            <button
              type="button"
              onClick={onRequest}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Request connection
            </button>
            <p className="mt-3 text-xs text-slate-400">Demo: requesting opens the approval state below.</p>
          </div>
        )}

        {status === 'pending' && (
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">Connection request pending approval</h2>
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">demo</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Request sent. Buyer and seller must both approve before the deal room (messages, documents, milestones) is
              opened. No sensitive material is visible until then.
            </p>
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <b>Approve to open the deal room</b> — demo represents both counterparties accepting the connection.
            </div>
            <button
              type="button"
              onClick={onApprove}
              className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
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
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Transaction milestone</h2>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
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
                      ? 'bg-emerald-600 text-white'
                      : m.status === 'current'
                        ? 'bg-sky-600 text-white ring-2 ring-sky-300'
                        : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {m.status === 'done' ? '✓' : i + 1}
                </span>
                <span
                  className={`whitespace-nowrap text-xs ${
                    m.status === 'current' ? 'font-semibold text-sky-800' : m.status === 'done' ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  {m.label}
                </span>
              </div>
              {i < track.length - 1 && <span className={`mx-1 h-px w-4 sm:w-6 ${i < currentIdx ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Project Falcon is <b>Conditionally awarded</b>: contract, provisioning and settlement milestones remain. Deposit &
          invoice rows below are status-only — no custody, no payment processing in the demo (SPEC §12.3).
        </p>
      </section>

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
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
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
              className="mt-2 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
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
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-700">
          live deals: {Array.isArray(liveDeals) ? liveDeals.length : 0}
        </span>
      )}
      <span className="text-xs text-slate-500">Deal room — DEMO content. Statuses only; no live transaction.</span>
      {liveFalcon && apiStatus === 'live' && (
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
          live Falcon deal: {liveFalcon.status || '—'}
        </span>
      )}
      <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
        negotiation: {deal.offer.status}
      </span>
    </div>
  )
}

function Section({ title, right, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
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
      right={<span className="text-[10px] text-slate-400">{deal.participants.length} parties</span>}
    >
      <ul className="space-y-2">
        {deal.participants.map((p) => (
          <li key={p.id} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500" />
            <div>
              <div className="font-medium text-slate-800">
                {p.role} <span className="text-xs font-normal text-slate-400">· {p.identity}</span>
              </div>
              <div className="text-xs text-slate-500">{p.contact}</div>
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
        <div className="font-medium text-slate-800">{o.selected}</div>
        <div className="text-xs text-slate-500">
          Quote <b>{o.quoteVersion}</b> · {o.quoteDate}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <dt className="text-slate-500">Committed (USD/hr)</dt>
          <dd className="text-right font-semibold text-slate-800">{o.committedPerAccelHr.toFixed(2)}</dd>
          <dt className="text-slate-500">On-demand (USD/hr)</dt>
          <dd className="text-right text-slate-800">{o.onDemandPerAccelHr.toFixed(2)}</dd>
          <dt className="text-slate-500">Accelerators</dt>
          <dd className="text-right text-slate-800">{o.count}× H200</dd>
          <dt className="text-slate-500">Term</dt>
          <dd className="text-right text-slate-800">{o.termMonths} months</dd>
        </dl>
      </div>
    </Section>
  )
}

function NegotiationCard({ deal }) {
  return (
    <Section title="Negotiation state">
      <p className="text-sm text-slate-700">{deal.negotiation.state}</p>
      {deal.negotiation.approvedDeviations.map((d) => (
        <div key={d.id} className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs">
          <div className="font-semibold text-slate-800">{d.item}</div>
          <p className="text-slate-600">{d.detail}</p>
          <p className="mt-1 text-slate-400">
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
      right={<span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">no custody</span>}
    >
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-600">Deposit</span>
        <span className="font-semibold capitalize text-slate-800">{deal.deposit.status.replace('_', ' ')}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{deal.deposit.note}</p>
      <ul className="mt-3 space-y-2">
        {deal.invoices.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
            <div>
              <div className="text-slate-700">{inv.label}</div>
              <div className="text-xs text-slate-400">{inv.note}</div>
            </div>
            <span className="ml-2 shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold capitalize text-amber-800">
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
      right={<span className="text-[10px] text-slate-400">structured · buyer / seller / operator</span>}
    >
      <div className="space-y-3">
        {deal.messages.map((m) => {
          const s = ROLE_STYLES[m.from] || ROLE_STYLES.operator
          return (
            <div key={m.id} className={`max-w-[92%] rounded-lg border px-3 py-2 ${s.bg} ${s.border} ${s.align}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-semibold capitalize ${s.name}`}>{m.from}</span>
                <span className="text-[10px] text-slate-400">{fmtDate(m.at)}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-800">{m.text}</p>
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
    <Section title="Documents checklist" right={<span className="text-[10px] text-slate-400">{received}/{deal.documents.length} received</span>}>
      <ul className="space-y-1.5">
        {deal.documents.map((d) => (
          <li key={d.id} className="flex items-start justify-between gap-2 text-sm">
            <div className="min-w-0">
              <div className="truncate text-slate-700">{d.name}</div>
              {!d.received && d.note && <div className="text-xs text-slate-400">{d.note}</div>}
            </div>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                d.received ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
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
                t.status === 'done' ? 'bg-emerald-500' : t.status === 'open' ? 'bg-amber-500' : 'bg-slate-300'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-slate-700">{t.label}</div>
              <div className="text-xs text-slate-400">
                Owner: {t.owner} · due {t.due}
              </div>
            </div>
            <span className="shrink-0 text-xs capitalize text-slate-500">{t.status}</span>
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
      right={<span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">conditional</span>}
    >
      <p className="mb-2 text-xs text-slate-500">
        {met}/{deal.eligibility.conditions.length} conditions met. Pre-screening only — not legal advice (SPEC §10.1).
      </p>
      <ul className="space-y-1.5">
        {deal.eligibility.conditions.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${c.met ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="text-slate-700">{c.label}</span>
            {c.pending && <span className="ml-auto shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">open</span>}
          </li>
        ))}
      </ul>
    </Section>
  )
}
