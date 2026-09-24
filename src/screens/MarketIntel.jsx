// src/screens/MarketIntel.jsx — Market Intelligence (D11+D14, SPEC §14, §16.3 screen 11)
import { useMemo, useState } from 'react'
import { marketObservations } from '../data/seed.js'
import { groupMarket, acceleratorFamily, MARKET_LEVELS } from '../lib/deal.js'
import { DemoBadge } from './ui.jsx'

const LEVEL_META = {
  Indicative: { desc: 'Public / advertised pricing. Illustrative, not transacted.', chip: 'bg-sky-100 text-sky-700' },
  Quoted: { desc: 'Seller offers on Sovereign Grid with stated validity.', chip: 'bg-amber-100 text-amber-700' },
  Transacted: { desc: 'Executed deals — anonymized & aggregated to protect parties.', chip: 'bg-emerald-100 text-emerald-700' },
}

export default function MarketIntel() {
  const [levelFilter, setLevelFilter] = useState('All')

  const obs = useMemo(
    () =>
      marketObservations.map((o) => ({
        ...o,
        level: o.level,
        family: acceleratorFamily(o.accelerator),
      })),
    [],
  )

  // Aggregate per level+family+region (levels never mixed — grouped by level first).
  const { cells, hidden } = useMemo(() => groupMarket(obs, { groups: (o) => `${o.level}|${o.family}|${o.region}` }), [obs])

  const priceRows = obs.filter((o) => levelFilter === 'All' || o.level === levelFilter)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-slate-500">Benchmark view — every figure DEMO / illustrative, never a live market price.</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Market Intelligence</h1>

      {/* Publication control banner (SPEC §14.3) */}
      <div className="mt-3 rounded-lg border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        <span className="font-semibold">Indicative analytics — not a Sovereign Grid index.</span>{' '}
        A live index requires documented inclusion rules, quality filters, observation minimums, outlier policy, conflict
        controls, revision policy and independent governance. Until those exist, outputs are labelled indicative (SPEC
        §14.3).
      </div>

      {/* Three data levels */}
      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {MARKET_LEVELS.map((level) => (
          <LevelPanel key={level} level={level} meta={LEVEL_META[level]} cells={cells.filter((c) => c.level === level)} hidden={hidden.filter((c) => c.level === level)} />
        ))}
      </div>

      {/* Price series by accelerator family */}
      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Price series by accelerator family</h2>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            Source level:
            <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
              {['All', ...MARKET_LEVELS].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="mb-3 text-xs text-slate-500">Observations by accelerator family (H200, MI300X, TPU, Ascend 910C) with region, term, timestamp and source level.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Family</th>
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Term</th>
                <th className="px-3 py-2">$/accel-hr</th>
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((o) => (
                <tr key={o.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{o.family}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL_META[o.level].chip}`}>{o.level}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{o.region}</td>
                  <td className="px-3 py-2 text-slate-700">{o.term}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{o.pricePerAccelHr.toFixed(2)}</td>
                  <td className="px-3 py-2 text-slate-600">{o.date}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{o.source}</td>
                </tr>
              ))}
              {priceRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-slate-500">No observations at this level.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Forward scenario (indicative) */}
      <ForwardScenario />

      <p className="mt-4 text-xs text-slate-400">Demo — illustrative analytics. Published analytics are aggregated and reviewed for confidentiality (SPEC §15.2).</p>
    </div>
  )
}

function LevelPanel({ level, meta, cells, hidden }) {
  return (
    <section className={`rounded-lg border p-4 shadow-sm ${level === 'Indicative' ? 'border-sky-200 bg-sky-50/40' : level === 'Quoted' ? 'border-amber-200 bg-amber-50/40' : 'border-emerald-200 bg-emerald-50/40'}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">{level}</h3>
        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${meta.chip}`}>{level === 'Indicative' ? 'public' : level === 'Quoted' ? 'quoted' : 'transacted'}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{meta.desc}{hidden.length > 0 && <span className="font-medium text-slate-500"> — {hidden.length} cell{hidden.length > 1 ? 's' : ''} withheld below the 3-observation minimum</span>}</p>

      {cells.length === 0 && hidden.length === 0 && <p className="mt-3 text-xs text-slate-400">No observations at this level.</p>}

      <ul className="mt-3 space-y-2">
        {cells.map((c) => (
          <li key={c.key} className="rounded-md border border-white bg-white p-2.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">{c.family || c.key}</span>
              <span className="text-[10px] text-slate-400">{c.region}</span>
            </div>
            <div className="mt-1 flex items-end justify-between">
              <span className="text-lg font-bold text-slate-900">${c.avg.toFixed(2)}<span className="text-xs font-normal text-slate-400">/accel-hr</span></span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{c.count} obs</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">min ${c.min.toFixed(2)} · max ${c.max.toFixed(2)} · latest {c.latest}</div>
          </li>
        ))}

        {hidden.map((c) => (
          <li key={c.key} className="rounded-md border border-dashed border-slate-300 bg-white/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{c.family || c.key}</span>
              <span className="text-[10px] text-slate-400">{c.region}</span>
            </div>
            <div className="mt-1 text-xs italic text-slate-500">insufficient observations ({c.count} &lt; 3)</div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ForwardScenario() {
  const scenarios = [
    { id: 'sc-1', family: 'H200', region: 'EU', term: 'committed 24mo', indicative: 2.2, forward: 2.05, note: 'assumes committed demand firming' },
    { id: 'sc-2', family: 'MI300X', region: 'US', term: 'committed 12mo', indicative: 1.9, forward: 1.82, note: 'assumes supply expansion' },
    { id: 'sc-3', family: 'TPU v7', region: 'GCC', term: 'spot', indicative: 2.5, forward: 2.4, note: 'assumes interruptible supply growth' },
    { id: 'sc-4', family: 'Ascend 910C', region: 'China', term: 'committed 24mo', indicative: 1.65, forward: 1.7, note: 'assumes demand uplift' },
  ]
  return (
    <section className="mt-8 rounded-lg border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Forward scenario</h2>
        <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700">scenario — indicative</span>
      </div>
      <p className="mb-3 mt-1 text-xs text-slate-500">
        Illustrative forward expectations derived from the indicative-level observations above. These are NOT quotes and
        NOT a listed derivative (SPEC §14.4). Sovereign Grid does not operate a regulated futures market in the MVP.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-indigo-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Family</th>
              <th className="px-3 py-2">Region</th>
              <th className="px-3 py-2">Term</th>
              <th className="px-3 py-2">Indicative</th>
              <th className="px-3 py-2">Forward</th>
              <th className="px-3 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => (
              <tr key={s.id} className="border-b border-indigo-100">
                <td className="px-3 py-2 font-medium text-slate-800">{s.family}</td>
                <td className="px-3 py-2 text-slate-700">{s.region}</td>
                <td className="px-3 py-2 text-slate-700">{s.term}</td>
                <td className="px-3 py-2 text-slate-700">${s.indicative.toFixed(2)}</td>
                <td className="px-3 py-2 font-semibold text-indigo-800">${s.forward.toFixed(2)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{s.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
