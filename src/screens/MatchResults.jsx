// src/screens/MatchResults.jsx
// Normalized match results for the golden Project Falcon request.
//
// Wave D: when an authenticated session exists, the screen drives the Falcon
// request through the live API — creating it via POST /api/requests if needed,
// then reading GET /api/requests/:id/matches and rendering bookable /
// disqualified / excluded exactly as the server computes it (93 / 90 / 87 on
// the golden path, with Ascend disqualified on its route-condition reason).
// If the API is unreachable (the static Pages site) or the user is anonymous,
// it falls back to the exact same unified shape computed locally from seed
// data, so the page always renders — never a white screen.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarket } from '../store/MarketContext.jsx'
import { api } from '../lib/api.js'
import { getToken } from '../lib/auth.js'
import { goldenRequest } from '../data/seed.js'
import { buildUnifiedMatchesFromSeed, requestToPayload } from '../lib/apiMappers.js'
import { DemoBadge, OfflineBadge } from './ui.jsx'

const DIM_LABELS = {
  workloadPerformance: 'Workload perf.',
  completeEconomics: 'Economics',
  availabilityDelivery: 'Availability',
  sovereignEligibility: 'Sovereignty',
  resilience: 'Resilience',
  commercialFlexibility: 'Flexibility',
  evidenceConfidence: 'Evidence',
}

async function resolveFalconMatches(token) {
  // Find an existing Falcon request, else create one from the golden demo
  // request so the server reproduces the canonical 93/90/87 result.
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

  // Always-available seed fallback (renders before/without network).
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        {status === 'offline' && <OfflineBadge />}
        {status === 'live' && (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-700">
            live API match
          </span>
        )}
        <span className="text-xs text-slate-500">Normalized offers — ranked by Match Score (0–100).</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Match Results — {requestName}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {headline}. Offers are normalized to a complete-cost basis and ranked by Match Score
        (0–100). Non-NVIDIA and regional accelerators are included on equal footing.
      </p>
      <ul className="mt-3 grid max-w-3xl grid-cols-1 gap-1 text-sm text-slate-600 sm:grid-cols-2">
        {goldenRequest.summary.requirements.map((r) => (
          <li key={r} className="flex items-start gap-1.5">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
            {r}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-slate-800">
        Bookable offers ({bookable.length})
      </h2>

      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
        <table className="w-full min-w-[820px] border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Offer</th>
              <th className="px-3 py-2">Match</th>
              <th className="px-3 py-2">$/accel-hr (committed)</th>
              <th className="px-3 py-2">Effective $/hr</th>
              <th className="px-3 py-2">Performance</th>
              <th className="px-3 py-2">Sovereignty</th>
              <th className="px-3 py-2">Power/Resilience</th>
              <th className="px-3 py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {bookable.map((m) => (
              <OfferRow
                key={m.listingId}
                m={m}
                expanded={expanded === m.listingId}
                onToggle={() => setExpanded(expanded === m.listingId ? null : m.listingId)}
              />
            ))}
            {bookable.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  No bookable offers for this request.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Disqualified by policy */}
      {disqualified.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-800">Attractive offers disqualified by policy condition ({disqualified.length})</h2>
          <p className="mb-2 text-sm text-slate-600">
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

      {/* Excluded summary */}
      <p className="mt-8 text-xs text-slate-500">
        {excluded} listing{excluded === 1 ? '' : 's'} excluded by hard filters (location, firmness,
        capacity, timing, or compatibility) for this request.
      </p>
    </div>
  )
}

function OfferRow({ m, expanded, onToggle }) {
  const comp = m.componentScores || {}
  const b = m.scoreBreakdown || {}

  return (
    <>
      <tr className="cursor-pointer border-b border-slate-100 hover:bg-sky-50/50" onClick={onToggle}>
        <td className="px-3 py-3">
          <div className="font-medium text-slate-900">{m.name}</div>
          <div className="text-xs text-slate-500">{m.listingId}</div>
        </td>
        <td className="px-3 py-3 text-slate-700">{typeof m.rank === 'number' ? `#${m.rank}` : ''}</td>
        <td className="px-3 py-3 font-medium text-slate-900">
          {typeof m.committedPerAccelHr === 'number' ? `$${m.committedPerAccelHr.toFixed(2)}` : '—'}
        </td>
        <td className="px-3 py-3 text-slate-700">
          {typeof m.effectivePerAccelHr === 'number' ? `$${m.effectivePerAccelHr.toFixed(2)}` : '—'}
        </td>
        <td className="px-3 py-3">{comp.performance ?? '—'}</td>
        <td className="px-3 py-3">{comp.sovereignty ?? '—'}</td>
        <td className="px-3 py-3">{comp.powerResilience ?? '—'}</td>
        <td className="px-3 py-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${m.matchScore >= 80 ? 'bg-emerald-100 text-emerald-800' : m.matchScore >= 68 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
            {m.matchScore}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Score breakdown</h4>
                <div className="space-y-1.5">
                  {Object.keys(b).length === 0 && <p className="text-sm text-slate-500">No breakdown available.</p>}
                  {Object.entries(b).map(([dim, v]) => (
                    <div key={dim} className="flex items-center gap-2 text-sm">
                      <span className="w-32 shrink-0 text-slate-600">{DIM_LABELS[dim] || dim}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200">
                        <div className="h-full bg-sky-500" style={{ width: `${v.score}%` }} />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                        {v.score}/100 · w{v.weight}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-sm">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Why ranked</h4>
                <p className="text-slate-700">{m.explanation || '—'}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>TCV: <b>{typeof m.totalContractValue === 'number' ? `$${m.totalContractValue.toLocaleString()}` : '—'}</b></div>
                  <div>Monthly run rate: <b>{typeof m.monthlyRunRate === 'number' ? `$${m.monthlyRunRate.toLocaleString()}` : '—'}</b></div>
                  <div>Commitment value vs on-demand: <b>{typeof m.commitmentValue === 'number' ? `$${m.commitmentValue.toLocaleString()}` : '—'}</b></div>
                  <div>Break-even utilization: <b>{typeof m.breakEvenUtilization === 'number' ? `${(m.breakEvenUtilization * 100).toFixed(0)}%` : '—'}</b></div>
                </div>
                <Link
                  to="/dealroom"
                  className="mt-4 inline-block rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Request connection → Deal Room
                </Link>
                <p className="mt-2 text-[11px] text-slate-400">
                  Opens the connection-approval state for the Falcon deal, then the Deal Room on approval (SPEC §16.4).
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function HeldCard({ m }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-rose-900">{m.name}</h3>
          <p className="text-xs text-rose-700">
            {/* eslint-disable-next-line react/no-unescaped-entities */}
            Match score <b>{m.matchScore}</b> · {m.listingId}
          </p>
        </div>
        <span className="rounded bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">DISQUALIFIED — policy condition</span>
      </div>
      <p className="mt-2 text-sm text-rose-900">{m.disqualifyReason}</p>
      <p className="mt-1 text-xs text-rose-700">
        Route-specific, evidence-driven decision — not a blanket geography exclusion. Listed as eligible supply in the
        market; this transaction requires additional evidence before it is bookable.
      </p>
    </div>
  )
}
