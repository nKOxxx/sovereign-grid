// src/screens/Calculator.jsx — Five-Year Calculator (D07, SPEC §8)
import { useEffect, useMemo, useState } from 'react'
import { computeCalculator, WORKLOAD_PROFILES, workloadCostsFor, spotExposure } from '../lib/cost.js'
import { goldenRequest, listingById, DEMO_NOTE } from '../data/seed.js'
import { api } from '../lib/api.js'
import { getToken } from '../lib/auth.js'
import { DemoBadge, Field, inputCls, OfflineBadge } from './ui.jsx'
import Select from '../components/Select.jsx'

// Prefill from Project Falcon (SPEC §16.2): 256x H200, 24 months.
// Usable committed price taken from the EU (Nordic) H200 listing.
const FALCON = goldenRequest
const BASE_LISTING = listingById('eu-h200-nordics')
const PRICE = BASE_LISTING.price.committedPerAccelHr
const ON_DEMAND = BASE_LISTING.price.onDemandPerAccelHr

const TERM_BUTTONS = [
  { years: 1, label: '1 yr' },
  { years: 2, label: '2 yr (24 mo)' },
  { years: 3, label: '3 yr' },
  { years: 5, label: '5 yr' },
]

const fmtUsd = (n) =>
  '$' +
  n.toLocaleString('en-US', { maximumFractionDigits: 0 })

const fmtHr = (n) => '$' + n.toFixed(2)

const r2 = (n) => Math.round(n * 100) / 100

export default function Calculator() {
  const [count, setCount] = useState(FALCON.count)
  const [price, setPrice] = useState(r2(PRICE))
  const [onDemand, setOnDemand] = useState(r2(ON_DEMAND))
  const [utilizationPct, setUtilizationPct] = useState(Math.round((FALCON.workload.utilization || 0.65) * 100))
  const [termYears, setTermYears] = useState(2)
  const [setupCost, setSetupCost] = useState(0)
  const [financingRate, setFinancingRate] = useState(8)
  const [financedPct, setFinancedPct] = useState(60)
  const [resalePct, setResalePct] = useState(0)
  const [resiliencePct, setResiliencePct] = useState(5)
  const [sovereigntyPct, setSovereigntyPct] = useState(3)
  const [workloadId, setWorkloadId] = useState('70b-train')

  // Local computation is the always-working base — the screen renders instantly
  // and still functions entirely offline (the Pages site has no backend).
  const localR = useMemo(
    () =>
      computeCalculator({
        count,
        pricePerAccelHr: price,
        onDemandPerAccelHr: onDemand,
        utilization: utilizationPct / 100,
        setupCost,
        termYears,
        resiliencePct,
        sovereigntyPct,
        financedPct,
        financingRate,
        resalePct,
      }),
    [count, price, onDemand, utilizationPct, termYears, setupCost, resiliencePct, sovereigntyPct, financedPct, financingRate, resalePct],
  )

  // When authenticated and online, POST the inputs to the server calculator and
  // use the authoritative returned quote (identical numbers — verbatim port).
  // Any failure (offline, anonymous) falls back to localR with an offline badge.
  const [serverQuote, setServerQuote] = useState(null)
  const [apiStatus, setApiStatus] = useState('offline') // 'live' | 'offline'

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
      .post(
        '/calculator/quote',
        {
          count,
          pricePerAccelHr: price,
          onDemandPerAccelHr: onDemand,
          utilization: utilizationPct / 100,
          setupCost,
          termYears,
          resiliencePct,
          sovereigntyPct,
          financedPct,
          financingRate,
          resalePct,
        },
        { token },
      )
      .then((d) => {
        if (!active) return
        if (d && d.quote) {
          setServerQuote(d.quote)
          setApiStatus('live')
        }
      })
      .catch(() => {
        if (!active) return
        setServerQuote(null)
        setApiStatus('offline')
      })
    return () => {
      active = false
    }
  }, [count, price, onDemand, utilizationPct, termYears, setupCost, resiliencePct, sovereigntyPct, financedPct, financingRate, resalePct])

  // Use the server quote when available, otherwise the local computation.
  const r = serverQuote || localR

  // SPEC §8.2 leftovers: cost per workload + spot exposure.
  const workloadCosts = useMemo(() => workloadCostsFor(r.effectivePerAccelHr), [r.effectivePerAccelHr])
  const selectedWorkload = WORKLOAD_PROFILES[workloadId] || WORKLOAD_PROFILES['70b-train']
  // Spot exposure derived from the selected offer's own data (Nordic H200).
  const spot = useMemo(
    () =>
      spotExposure({
        firmness: BASE_LISTING.firmness,
        minGuaranteed: BASE_LISTING.commitment && BASE_LISTING.commitment.minGuaranteed,
      }),
    [],
  )

  const savingsColor = r.commitmentValue >= 0 ? 'text-success' : 'text-danger'

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        {apiStatus === 'offline' && <OfflineBadge label="illustrative — API offline" />}
        {apiStatus === 'live' && (
          <span className="rounded bg-[color:var(--sg-success-dim)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-success">
            live API quote
          </span>
        )}
        <span className="text-xs text-text-3">All outputs below are DEMO / illustrative — never a live market figure.</span>
      </div>
      <h1 className="sg-display text-2xl">Five-Year Calculator</h1>
      <p className="mt-1 max-w-3xl text-sm text-text-2">
        Compare committed (reserved) vs on-demand economics for {FALCON.name} — {FALCON.count}x H200, 24 months. Changing any
        input recalculates every output immediately.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <section className="sg-card p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-3">Assumptions</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Accelerator count">
              <input type="number" min={1} className={inputCls} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 0))} />
            </Field>
            <Field label="Unit price ($/accel-hr, committed)">
              <input type="number" step="0.01" min={0} className={inputCls} value={price} onChange={(e) => setPrice(r2(Number(e.target.value) || 0))} />
            </Field>
            <Field label="On-demand price ($/accel-hr)">
              <input type="number" step="0.01" min={0} className={inputCls} value={onDemand} onChange={(e) => setOnDemand(r2(Number(e.target.value) || 0))} />
            </Field>
            <Field label={`Utilization (${utilizationPct}%)`}>
              <input type="range" min={5} max={100} className="w-full accent-accent" value={utilizationPct} onChange={(e) => setUtilizationPct(Number(e.target.value))} />
            </Field>
            <Field label="Setup / migration ($)">
              <input type="number" step="1000" min={0} className={inputCls} value={setupCost} onChange={(e) => setSetupCost(Number(e.target.value) || 0)} />
            </Field>
            <div>
              <span className="mb-1 block text-xs font-medium text-text-2">Term</span>
              <div className="flex flex-wrap gap-2">
                {TERM_BUTTONS.map((t) => (
                  <button
                    key={t.years}
                    type="button"
                    onClick={() => setTermYears(t.years)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      termYears === t.years ? 'border-transparent bg-accent text-white' : 'border-[color:var(--sg-border)] bg-elevated text-text-2'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Financing rate (%/yr, simple add-on)">
              <input type="number" step="0.5" min={0} className={inputCls} value={financingRate} onChange={(e) => setFinancingRate(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Financed portion (%)">
              <input type="number" step="5" min={0} max={100} className={inputCls} value={financedPct} onChange={(e) => setFinancedPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
            </Field>
            <Field label="Resale assumption (% of TCV recovered)">
              <input type="number" step="5" min={0} max={100} className={inputCls} value={resalePct} onChange={(e) => setResalePct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
            </Field>
            <Field label="Resilience premium (% of TCV)">
              <input type="number" step="0.5" min={0} className={inputCls} value={resiliencePct} onChange={(e) => setResiliencePct(Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <Field label="Sovereignty premium (% of TCV)">
              <input type="number" step="0.5" min={0} className={inputCls} value={sovereigntyPct} onChange={(e) => setSovereigntyPct(Math.max(0, Number(e.target.value) || 0))} />
            </Field>
          </div>
        </section>

        {/* Outputs */}
        <section className="rounded-md border border-[color:var(--sg-warning)] bg-[color:var(--sg-warning-dim)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Outputs</h2>
            <span className="rounded bg-[color:var(--sg-warning-dim)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">demo</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DemoStat label="Monthly run rate" value={fmtUsd(r.monthlyRunRate)} />
            <DemoStat label="Total contract value" value={fmtUsd(r.totalContractValue)} />
            <DemoStat label="Effective $/accel-hr" value={fmtHr(r.effectivePerAccelHr)} />
            <DemoStat
              label="Commitment vs on-demand"
              value={(r.commitmentValue >= 0 ? '+' : '−') + fmtUsd(Math.abs(r.commitmentValue))}
              valueClass={savingsColor}
            />
            <DemoStat label="Break-even utilization" value={(r.breakEvenUtilization * 100).toFixed(0) + '%'} />
            <DemoStat label="Resilience premium" value={fmtUsd(r.resiliencePremium)} />
            <DemoStat label="Sovereignty premium" value={fmtUsd(r.sovereigntyPremium)} />
            <DemoStat label="Spot exposure" value={(spot * 100).toFixed(0) + '%'} valueClass={spot > 0 ? 'text-warning' : 'text-success'} />
          </div>
          <p className="mt-2 text-[11px] text-text-3">
            Spot exposure = share of price attributed to spot / interruptible capacity, from the selected offer's own
            data ({BASE_LISTING.name}: firmness <b>{BASE_LISTING.firmness}</b>, min-guaranteed{' '}
            {((BASE_LISTING.commitment && BASE_LISTING.commitment.minGuaranteed) ?? 0) * 100}%). Demo — not a live figure.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-[color:var(--sg-warning)] pt-3 text-xs text-text-2 sm:grid-cols-3">
            <div>
              Net TCV (financing + resale):{' '}
              <b className="sg-num">{fmtUsd(r.netTotalContractValue)}</b>
            </div>
            <div>
              Financing interest: <b className="sg-num">{fmtUsd(r.financingInterest)}</b>
            </div>
            <div>
              Resale recovery: <b className="sg-num">{fmtUsd(r.resaleRecovery)}</b>
            </div>
          </div>

          <p className="mt-4 text-xs text-text-3">
            {r.breakEvenUtilization > 0 && r.breakEvenUtilization < 1
              ? `Committing is favorable above ${(r.breakEvenUtilization * 100).toFixed(0)}% utilization; below that, on-demand at ${fmtHr(onDemand)} accel-hr wins.`
              : 'Commitment economics depend on your utilization assumption.'}
          </p>
        </section>
      </div>

      {/* Cost per workload (SPEC §8.2) */}
      <section className="sg-card mt-6 p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Cost per workload</h2>
          <span className="rounded bg-elevated px-2 py-0.5 text-[10px] font-bold uppercase text-text-3">demo assumption</span>
        </div>
        <p className="mb-3 text-xs text-text-3">
          Maps a workload to an assumed accelerator-hour draw (GPU-hours) and prices it at the current effective{' '}
          $/accel-hr ({fmtHr(r.effectivePerAccelHr)}). The GPU-hour assumption is explicit — never a measured figure.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Field label="Workload">
              <Select
                value={WORKLOAD_PROFILES[workloadId]?.label ?? Object.values(WORKLOAD_PROFILES)[0].label}
                onChange={(label) => {
                  const hit = Object.values(WORKLOAD_PROFILES).find((p) => p.label === label)
                  setWorkloadId(hit ? hit.id : workloadId)
                }}
                options={Object.values(WORKLOAD_PROFILES).map((p) => p.label)}
                label="Workload"
              />
            </Field>
            <p className="mt-2 text-[11px] text-text-3">{selectedWorkload.note}</p>
          </div>
          <div className="rounded-md border border-[color:var(--sg-warning)] bg-[color:var(--sg-warning-dim)] p-4">
            <div className="text-xs text-text-3">Cost per {selectedWorkload.kind} run</div>
            <div className="sg-num text-2xl font-bold text-text-1">{fmtUsd(workloadCosts[selectedWorkload.id])}</div>
            <div className="mt-1 text-[11px] text-text-3">
              <span className="sg-num">{selectedWorkload.gpuHours.toLocaleString()}</span> {selectedWorkload.unit} × <span className="sg-num">${r.effectivePerAccelHr.toFixed(2)}</span>/hr
            </div>
          </div>
        </div>
      </section>

      <p className="mt-4 text-xs text-text-4">{DEMO_NOTE}</p>
    </div>
  )
}

function DemoStat({ label, value, valueClass = 'text-text-1' }) {
  return (
    <div className="sg-card p-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-warning">demo</span>
      </div>
      <div className="mt-0.5 text-xs text-text-3">{label}</div>
      <div className={`sg-num text-lg font-bold ${valueClass}`}>{value}</div>
    </div>
  )
}
