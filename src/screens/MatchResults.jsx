// src/screens/MatchResults.jsx
// Normalized match results for the golden Project Falcon request.
//
// Wave G visual redesign: bookable offers are .sg-card tiles with the score as
// a big tabular .sg-num; the highest-score (#1) card carries the border-beam
// treatment (.sg-beam) and a 'BEST MATCH' .sg-pill--accent. The rest stay
// plain. All golden seed values (93 / 90 / 87), the offline fallback, badges,
// and e2e hooks (text asserting Sovereignty/Power/Resilience, non-NVIDIA
// accelerator names, etc.) are preserved.
//
// API behaviour unchanged: when an authenticated session exists, the screen
// drives Falcon through the live API (create if needed, then read matches);
// otherwise it falls back to the seed-computed shape.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarket } from '../store/MarketContext.jsx'
import { api } from '../lib/api.js'
import { getToken, getCurrentUser } from '../lib/auth.js'
import { goldenRequest } from '../data/seed.js'
import { buildUnifiedMatchesFromSeed, requestToPayload } from '../lib/apiMappers.js'
import { DemoBadge, OfflineBadge } from './ui.jsx'
import './wave-g.css'

async function resolveFalconMatches(token) {
  let list
  try {
    list = await api.get('/requests', { token })
  } catch {
    throw new Error('requests unavailable')
  }
  const existing = (list && list.requests || []).find(
    (r) => r && (r.name || '').toLowerCase().includes('falcon'),
  )
  let id = existing && existing.id
  if (!id) {
    const created = await api.post('/requests', requestToPayload(goldenRequest), { token })
    id = created && created.request && created.request.id
    if (!id) throw new Error('could not create request')
  }
  const matches = await api.get(`/requests/${id}/matches`, { token })
  if (!matches) throw new Error('no matches response')
  return {
    request: matches.request || { id, name: goldenRequest.name },
    bookable: matches.bookable || [],
    disqualified: matches.disqualified || [],
    excluded: matches.excludedByHardFilters ?? 0,
    status: 'live',
  }
}

export default function MatchResults() {
  const { listings } = useMarket()
  const [expanded, setExpanded] = useState(null)

  // The Accept offer action is buyer-only; other roles / anonymous visitors
  // keep the read-only match results (existing Deal Room link).
  const currentUser = getCurrentUser()
  const isBuyer = Boolean(currentUser && currentUser.role === 'buyer')

  const seed = useMemo(
    () => buildUnifiedMatchesFromSeed(listings, goldenRequest),
    [listings],
  )

  const [data, setData] = useState(seed)
  const [status, setStatus] = useState('offline') // 'live' | 'offline' | 'loading'
  const requestName = (data.request && data.request.name) || goldenRequest.name

  useEffect(() => {
    let active = true
    const token = getToken()
    if (!token) {
      setStatus('offline')
      return () => {
        active = false
      }
    }
    setStatus('loading')
    resolveFalconMatches(token)
      .then((live) => {
        if (!active) return
        setData(live)
        setStatus('live')
      })
      .catch(() => {
        if (!active) return
        setData(seed)
        setStatus('offline')
      })
    return () => {
      active = false
    }
  }, [seed])

  const { bookable, disqualified, excluded } = data
  const headline = goldenRequest.summary.headline
  const bestId = bookable.length
    ? bookable.reduce((a, b) => (b.matchScore > a.matchScore ? b : a)).listingId
    : null

  return (
    <div className="sg-root sg-matches min-h-screen bg-canvas">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <DemoBadge />
          {status === 'offline' && <OfflineBadge />}
          {status === 'live' && <span className="sg-pill sg-pill--success">live API match</span>}
          <span className="text-xs text-text-3">Normalized offers — ranked by Match Score (0–100).</span>
        </div>
        <h1 className="sg-display text-3xl sm:text-4xl">Match Results — {requestName}</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-2">
          {headline}. Offers are normalized to a complete-cost basis and ranked by Match Score
          (0–100). Non-NVIDIA and regional accelerators are included on equal footing.
        </p>
        <ul className="mt-4 grid max-w-3xl grid-cols-1 gap-1.5 text-sm text-text-3 sm:grid-cols-2">
          {goldenRequest.summary.requirements.map((r) => (
            <li key={r} className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{r}</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 text-lg font-semibold text-text-1">
          Bookable offers ({bookable.length})
        </h2>
        <div className="sg-match-grid mt-4">
          {bookable.length === 0 && (
            <p className="sg-empty col-span-full rounded-md p-4 text-sm text-text-3">
              No bookable offers for this request.
            </p>
          )}
          {bookable.map((m) => (
            <MatchCard key={m.listingId} m={m} best={m.listingId === bestId} isBuyer={isBuyer} />
          ))}
        </div>

        {disqualified.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-text-1">
              Attractive offers disqualified by policy condition ({disqualified.length})
            </h2>
            <p className="mb-3 text-sm text-text-3">
              These score well but fail an evidence-driven, route-specific eligibility condition. They are surfaced here
              transparently rather than silently dropped.
            </p>
            <div className="space-y-3">
              {disqualified.map((m) => (
                <HeldCard key={m.listingId} m={m} />
              ))}
            </div>
          </section>
        )}

        <p className="mt-8 text-xs text-text-4">
          {excluded} listing{excluded === 1 ? '' : 's'} excluded by hard filters (location, firmness,
          capacity, timing, or compatibility) for this request.
        </p>
      </div>
    </div>
  )
}

function shortDealId(id) {
  return id && id.length > 8 ? id.slice(0, 8) : id || ''
}

function MatchCard({ m, best, isBuyer }) {
  const comp = m.componentScores || {}
  const rank = typeof m.rank === 'number' ? `#${m.rank}` : ''
  const committed = typeof m.committedPerAccelHr === 'number' ? `$${m.committedPerAccelHr.toFixed(2)}` : '—'
  const effective = typeof m.effectivePerAccelHr === 'number' ? `$${m.effectivePerAccelHr.toFixed(2)}` : '—'
  const tcv = typeof m.totalContractValue === 'number' ? `$${m.totalContractValue.toLocaleString()}` : '—'

  // Inline offer-acceptance: POST /api/deals/accept (buyer only, idempotent).
  const [accept, setAccept] = useState(null) // null | {status:'loading'} | {status:'done', deal} | {status:'error', code}

  async function onAccept() {
    setAccept({ status: 'loading' })
    try {
      const token = getToken()
      const { deal } = await api.post('/deals/accept', { listingId: m.listingId }, { token })
      setAccept({ status: 'done', deal })
    } catch (err) {
      setAccept({ status: 'error', code: err && err.code })
    }
  }

  const accepting = accept && accept.status === 'loading'

  return (
    <article className={`sg-card flex flex-col p-5 ${best ? 'sg-beam sg-card--best' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {best && <span className="sg-pill sg-pill--accent">BEST MATCH</span>}
          <h3 className="sg-display mt-2 text-base">{m.name}</h3>
          <p className="mt-0.5 text-xs text-text-3">{m.listingId}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-3">Score</div>
          <div className={`sg-num text-4xl leading-none ${best ? 'text-accent' : 'text-text-1'}`}>
            {m.matchScore}
          </div>
          <div className="mt-0.5 text-xs text-text-4">{rank}</div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <MatchStat label="Committed" value={committed} sub="/accel-hr" />
        <MatchStat label="Effective" value={effective} sub="/hr" />
        <MatchStat label="Performance" value={comp.performance ?? '—'} />
        <MatchStat label="Sovereignty" value={comp.sovereignty ?? '—'} />
        <MatchStat label="Power / Resilience" value={comp.powerResilience ?? '—'} />
      </dl>

      <p className="mt-3 text-xs text-text-3">{m.explanation || '—'}</p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <span className="text-xs text-text-4">TCV {tcv}</span>
        <div className="flex flex-wrap items-center gap-2">
          {accept && accept.status === 'done' ? (
            <span className="sg-pill sg-pill--success">
              Accepted — deal <span className="sg-num">{shortDealId(accept.deal.id)}</span> ·{' '}
              <span className="sg-num">{accept.deal.status}</span>
            </span>
          ) : accept && accept.status === 'error' ? (
            <span className="text-xs text-danger">
              {accept.code === 'conflict' ? 'No longer available' : 'Could not accept offer'}
            </span>
          ) : (
            isBuyer && (
              <button type="button" className="sg-btn sg-btn--primary text-xs" disabled={accepting} onClick={onAccept}>
                {accepting ? 'Accepting…' : 'Accept offer'}
              </button>
            )
          )}
          <Link to="/dealroom" className="sg-btn sg-btn--primary text-xs">
            Request connection → Deal Room
          </Link>
        </div>
      </div>
    </article>
  )
}

function MatchStat({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <dt className="sg-stat__label">{label}</dt>
      <dd className="sg-stat__value break-words">
        <span className="sg-num">{value}</span>
        {sub && <span className="text-text-4"> {sub}</span>}
      </dd>
    </div>
  )
}

function HeldCard({ m }) {
  return (
    <div className="sg-card sg-card--danger p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-text-1">{m.name}</h3>
          <p className="text-xs text-text-3">
            Match score <b className="text-text-1">{m.matchScore}</b> · {m.listingId}
          </p>
        </div>
        <span className="sg-pill sg-pill--danger">DISQUALIFIED — policy condition</span>
      </div>
      <p className="mt-2 text-sm text-text-2">{m.disqualifyReason}</p>
      <p className="mt-1 text-xs text-text-3">
        Route-specific, evidence-driven decision — not a blanket geography exclusion. Listed as eligible supply in the
        market; this transaction requires additional evidence before it is bookable.
      </p>
    </div>
  )
}
