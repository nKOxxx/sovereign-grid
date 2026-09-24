// src/screens/MatchResults.jsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarket } from '../store/MarketContext.jsx'
import { matchAll } from '../lib/market.js'
import { computeCosts } from '../lib/cost.js'
import { goldenRequest, acceleratorProfiles } from '../data/seed.js'
import { DemoBadge } from './ui.jsx'

const DIM_LABELS = {
  workloadPerformance: 'Workload perf.',
  completeEconomics: 'Economics',
  availabilityDelivery: 'Availability',
  sovereignEligibility: 'Sovereignty',
  resilience: 'Resilience',
  commercialFlexibility: 'Flexibility',
  evidenceConfidence: 'Evidence',
}

export default function MatchResults() {
  const { listings } = useMarket()
  const [expanded, setExpanded] = useState(null)

  const result = useMemo(() => matchAll(listings, goldenRequest), [listings])
  const { offers, policyHolds, excluded } = result

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-slate-500">Normalized, illustrative offers — not live market data.</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Match Results — {goldenRequest.name}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {goldenRequest.summary.headline}. Offers are normalized to a complete-cost basis and ranked by Match Score
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
        Bookable offers ({offers.length})
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
            {offers.map((m) => (
              <OfferRow key={m.listing.id} m={m} expanded={expanded === m.listing.id} onToggle={() => setExpanded(expanded === m.listing.id ? null : m.listing.id)} />
            ))}
            {offers.length === 0 && (
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
      {policyHolds.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-800">Attractive offers disqualified by policy condition ({policyHolds.length})</h2>
          <p className="mb-2 text-sm text-slate-600">
            These score well but fail an evidence-driven, route-specific eligibility condition. They are surfaced here
            transparently rather than silently dropped.
          </p>
          <div className="space-y-3">
            {policyHolds.map((m) => (
              <HeldCard key={m.listing.id} m={m} />
            ))}
          </div>
        </section>
      )}

      {/* Excluded summary */}
      <p className="mt-8 text-xs text-slate-500">
        {excluded.length} listing{excluded.length === 1 ? '' : 's'} excluded by hard filters (location, firmness,
        capacity, timing, or compatibility) for this request.
      </p>
    </div>
  )
}

function OfferRow({ m, expanded, onToggle }) {
  const l = m.listing
  const acc = acceleratorProfiles[l.accelerator.profile] || {}
  const nonNvidia = !/nvidia/i.test((l.accelerator.vendor || 'nvidia'))
  const price = l.price ? l.price.committedPerAccelHr : 0
  const cost = computeCosts({
    count: goldenRequest.count,
    pricePerAccelHr: price,
    onDemandPerAccelHr: l.price ? l.price.onDemandPerAccelHr : price,
    utilization: (goldenRequest.workload && goldenRequest.workload.utilization) || 0.65,
    termYears: goldenRequest.termYears || 2,
  })
  const b = m.breakdown

  return (
    <>
      <tr className="cursor-pointer border-b border-slate-100 hover:bg-sky-50/50" onClick={onToggle}>
        <td className="px-3 py-3">
          <div className="font-medium text-slate-900">{l.name}</div>
          <div className="text-xs text-slate-500">
            {acc.model} · {l.facility.country}
            {nonNvidia && <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700">non-NVIDIA</span>}
          </div>
        </td>
        <td className="px-3 py-3 text-slate-700">#{m.listing.rank ?? ''}</td>
        <td className="px-3 py-3 font-medium text-slate-900">${price.toFixed(2)}</td>
        <td className="px-3 py-3 text-slate-700">${cost.effectivePerAccelHr.toFixed(2)}</td>
        <td className="px-3 py-3">{b.workloadPerformance.score}</td>
        <td className="px-3 py-3">{b.sovereignEligibility.score}</td>
        <td className="px-3 py-3">{b.resilience.score}</td>
        <td className="px-3 py-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${m.score >= 80 ? 'bg-emerald-100 text-emerald-800' : m.score >= 68 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
            {m.score}
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
                <p className="text-slate-700">{m.explanation}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>TCV (24 mo): <b>${cost.totalContractValue.toLocaleString()}</b></div>
                  <div>Monthly run rate: <b>${cost.monthlyRunRate.toLocaleString()}</b></div>
                  <div>Commitment value vs on-demand: <b>${cost.commitmentValue.toLocaleString()}</b></div>
                  <div>Break-even utilization: <b>{(cost.breakEvenUtilization * 100).toFixed(0)}%</b></div>
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
  const l = m.listing
  const price = l.price ? l.price.committedPerAccelHr : 0
  const acc = acceleratorProfiles[l.accelerator.profile] || {}
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-rose-900">
            {l.name}
            {!/nvidia/i.test((l.accelerator.vendor || 'nvidia')) && (
              <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] text-indigo-700">non-NVIDIA</span>
            )}
          </h3>
          <p className="text-xs text-rose-700">
            {acc.model} · {l.facility.country} · <b>Match score {m.score}</b> ({DIM_LABELS.completeEconomics}{' '}
            {m.breakdown.completeEconomics.score}, price ${price.toFixed(2)}/hr)
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
