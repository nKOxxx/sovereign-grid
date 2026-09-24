// src/screens/CapacityPassport.jsx — Capacity Passport (D09 + D16, SPEC §11)
import { useMemo, useState } from 'react'
import { buildPassport } from '../lib/passport.js'
import { sellerListings, DEMO_NOTE } from '../data/seed.js'
import { DemoBadge } from './ui.jsx'

const PASSPORT_IDS = ['eu-h200-nordics', 'gcc-h200', 'cn-ascend910c', 'eu-anon-mi300x']

const SECTION_LABELS = {
  identity: 'Identity',
  control: 'Capacity control',
  technical: 'Technical',
  power: 'Power certainty',
  resilience: 'Resilience',
  sovereignty: 'Sovereignty',
  tradeControl: 'Trade-control route',
}

const FRESH_STYLE = {
  fresh: 'bg-emerald-100 text-emerald-800',
  aging: 'bg-amber-100 text-amber-800',
  expired: 'bg-rose-100 text-rose-800',
}

export default function CapacityPassport() {
  const [sellerId, setSellerId] = useState('eu-h200-nordics')

  const passports = useMemo(
    () => PASSPORT_IDS.map((id) => buildPassport(sellerListings.find((l) => l.id === id))),
    [],
  )
  const p = passports.find((x) => x.listingId === sellerId) || passports[0]
  const profile = p.technicalExtra

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-slate-500">Evidence-backed asset profiles — every claim shows issuer, date, reviewer, expiry, scope (SPEC §6.3, §11).</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Capacity Passport</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Select a seller to view its verification status, evidence and scores. Verification is capped at “Operationally verified”
        for this demo — no seller is shown with an unearned top status.
      </p>

      {/* Seller picker */}
      <div className="mt-5 flex flex-wrap gap-2">
        {passports.map((x) => (
          <button
            key={x.listingId}
            type="button"
            onClick={() => setSellerId(x.listingId)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              x.listingId === sellerId ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {x.sellerName}
            <span className={x.listingId === sellerId ? 'ml-2 text-white/80' : 'ml-2 text-slate-400'}>{x.verificationStatus}</span>
          </button>
        ))}
      </div>

      {/* Header / ladder / scores */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{p.sellerName}</h2>
              <p className="text-sm text-slate-500">{p.entity}{p.anonymous ? ' (anonymous)' : ''} · {p.accelerator}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${p.rung >= 3 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
              {p.verificationStatus}
            </span>
          </div>

          {/* Verification ladder */}
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Verification status ladder</h3>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {p.ladder.map((step, i) => {
              const rung = i + 1
              const achieved = rung <= p.rung
              const cappedAbove = rung > p.maxDemoRung
              return (
                <span key={step} className="flex items-center gap-1">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                      achieved ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {step}
                    {cappedAbove && <span className="ml-1 text-[9px] text-amber-600">(demo cap)</span>}
                  </span>
                  {rung < p.ladder.length && <span className="text-slate-300">→</span>}
                </span>
              )
            })}
          </div>

          {/* Section coverage */}
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence sections</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {p.sections.map((s) => (
              <div key={s.id} className={`rounded-md border p-2 text-center ${s.covered ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="text-xs font-medium text-slate-700">{SECTION_LABELS[s.id]}</div>
                <div className={`mt-0.5 text-[10px] ${s.covered ? 'text-emerald-700' : 'text-slate-400'}`}>{s.covered ? 'covered' : 'no evidence yet'}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Scores */}
        <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Scores</h2>
          <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">demo</span>
          <div className="mt-3 space-y-3 text-sm">
            <ScoreRow label="Evidence confidence" value={p.confidence} />
            <ScoreRow label="Evidence coverage" value={p.evidenceCoveragePct} />
            <div className="rounded-md border border-amber-200 bg-white p-3 text-xs text-slate-600">
              <div className="font-semibold uppercase tracking-wide text-slate-500">Methodology version</div>
              <div className="mt-1 text-base font-bold text-slate-900">{p.methodologyVersion}</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">Scores summarize reviewed evidence — they never replace the underlying record (SPEC §11.2).</p>
        </section>
      </div>

      {/* Per-accelerator technical / portability (D16) */}
      {profile && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Accelerator compatibility & portability (D16)</h2>
          <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Block label="Frameworks" value={profile.frameworks.length ? profile.frameworks.join(', ') : '—'} />
            <Block label="Compilers" value={profile.compilers.length ? profile.compilers.join(', ') : '—'} />
            <Block label="Precision modes" value={profile.precision.length ? profile.precision.join(', ') : '—'} />
            <Block label="Benchmark provenance" value={profile.benchmarkSource || '—'} />
            <Block label="Portability" value={profile.portability || '—'} />
            <Block label="Migration effort" value={profile.migrationEffort || '—'} />
            <div className="sm:col-span-2">
              <div className="text-xs font-medium text-slate-500">Portability notes</div>
              <p className="mt-0.5 text-xs text-slate-600">{profile.portabilityNotes || '—'}</p>
            </div>
          </div>
        </section>
      )}

      {/* Evidence items */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Evidence</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Evidence</th>
                <th className="px-3 py-2">Issuer</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Reviewer</th>
                <th className="px-3 py-2">Scope</th>
                <th className="px-3 py-2">expiry</th>
                <th className="px-3 py-2">Freshness</th>
              </tr>
            </thead>
            <tbody>
              {p.evidence.map((e) => (
                <tr key={e.type} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{e.label}</td>
                  <td className="px-3 py-2 text-slate-600">{e.issuer}</td>
                  <td className="px-3 py-2 text-slate-600">{e.date}</td>
                  <td className="px-3 py-2 text-slate-600">{e.reviewer}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{e.scope}</td>
                  <td className="px-3 py-2 text-slate-600">{e.expiry}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${FRESH_STYLE[e.freshness]}`}>{e.freshness}</span>
                  </td>
                </tr>
              ))}
              {p.evidence.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-500">No evidence on file.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Expired or aging evidence reduces listing confidence and may block new transactions until refreshed (SPEC §6.3).
        </p>
      </section>

      <p className="mt-4 text-xs text-slate-400">{DEMO_NOTE}</p>
    </div>
  )
}

function ScoreRow({ label, value }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span className="font-semibold text-slate-700">{value}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-slate-200">
        <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  )
}

function Block({ label, value }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <p className="mt-0.5 text-xs text-slate-700">{value}</p>
    </div>
  )
}
