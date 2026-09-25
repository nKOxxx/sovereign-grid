// src/screens/FeeEngine.jsx — Operator Fee Engine (D06, SPEC §9)
import { useEffect, useMemo, useState } from 'react'
import { useMarket } from '../store/MarketContext.jsx'
import { computeFees } from '../lib/fees.js'
import { sellerListings, DEMO_NOTE } from '../data/seed.js'
import { DemoBadge, Field, inputCls, OfflineBadge } from './ui.jsx'
import { useRole } from '../lib/useRole.js'
import { getToken } from '../lib/auth.js'
import { fetchFeePolicy, saveFeePolicy, operatorLabel } from '../lib/operator.js'
import {
  buildSensitivitySeries,
  buildFeeFlow,
  buildPartnerSplit,
  buildEffectiveRate,
  FeeSensitivityChart,
  FeeFlowBreakdown,
  PartnerSplitView,
} from './FeeVisualizations.jsx'

const fmtHr = (n) => '$' + n.toFixed(3)
const fmtUsd = (n) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
const r3 = (n) => Math.round(n * 1000) / 1000

export default function FeeEngine() {
  const { platformFee, setPlatformFee } = useMarket()
  const [sellerId, setSellerId] = useState('eu-h200-nordics')
  const [passthrough, setPassthrough] = useState(r3(0.1))
  const [feeBasis, setFeeBasis] = useState('pct') // 'pct' | 'perHr'
  const [perHrFee, setPerHrFee] = useState(0.25)
  const [feePayer, setFeePayer] = useState('buyer') // buyer | seller | split
  const [splitPct, setSplitPct] = useState(50)
  const [taxRate, setTaxRate] = useState(5)
  const [partnerSplitPct, setPartnerSplitPct] = useState(30)
  const [minMarginPct, setMinMarginPct] = useState(8)
  const [approved, setApproved] = useState(false)

  const listing = sellerListings.find((l) => l.id === sellerId) || sellerListings[0]
  const sellerBase = listing.price.committedPerAccelHr

  const fee = useMemo(
    () =>
      computeFees({
        sellerBase,
        passthrough,
        platformFee: feeBasis === 'pct' ? platformFee : perHrFee,
        feeBasis,
        feePayer,
        splitPct,
        taxRate: taxRate / 100,
        partnerSplitPct,
        minMarginPct,
      }),
    [sellerBase, passthrough, platformFee, feeBasis, perHrFee, feePayer, splitPct, taxRate, partnerSplitPct, minMarginPct],
  )

  // Wave G2 — visualizations derive every number from the live config through
  // the real domain functions (computeFees / computeCalculator / partnerSplit).
  const sensitivity = useMemo(
    () => buildSensitivitySeries({ sellerBase, passthrough, feePayer, splitPct, taxRate: taxRate / 100 }),
    [sellerBase, passthrough, feePayer, splitPct, taxRate],
  )
  const flow = useMemo(
    () => buildFeeFlow({ sellerBase, passthrough, platformFee: feeBasis === 'pct' ? platformFee : perHrFee, feeBasis, feePayer, splitPct, taxRate: taxRate / 100 }),
    [sellerBase, passthrough, platformFee, feeBasis, perHrFee, feePayer, splitPct, taxRate],
  )
  const split = useMemo(() => buildPartnerSplit({ platformGross: fee.platformGross, partnerSplitPct }), [fee.platformGross, partnerSplitPct])
  const effectivePerAccelHr = useMemo(
    () => buildEffectiveRate({ count: listing.count, pricePerAccelHr: listing.price.committedPerAccelHr, onDemandPerAccelHr: listing.price.onDemandPerAccelHr }),
    [listing],
  )

  const showGuard = fee.needsApproval && !approved

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-slate-500">Configurable demo fee policy — not a final commercial policy (SPEC §9.4).</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Operator Fee Engine</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Set the platform fee and see buyer, seller and Sovereign Grid economics update immediately. Buyer price = seller base +
        pass-through + buyer-paid fee + tax; seller payout = seller base − seller-paid fee (SPEC §9.2).
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Fee configuration */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Fee configuration</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Seller / quote">
              <select className={inputCls} value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                {sellerListings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Seller base price ($/accel-hr)">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{fmtHr(sellerBase)}</div>
            </Field>
            <Field label="Pass-through ($/accel-hr)">
              <input type="number" step="0.01" min={0} className={inputCls} value={passthrough} onChange={(e) => setPassthrough(r3(Number(e.target.value) || 0))} />
            </Field>
            <Field label="Fee basis">
              <div className="flex gap-2">
                <button type="button" onClick={() => setFeeBasis('pct')} className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${feeBasis === 'pct' ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                  % of price
                </button>
                <button type="button" onClick={() => setFeeBasis('perHr')} className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${feeBasis === 'perHr' ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                  $/accel-hr
                </button>
              </div>
            </Field>
            {feeBasis === 'pct' ? (
              <Field label={`Platform fee (${(platformFee * 100).toFixed(1)}%)`}>
                <input type="range" min={0} max={40} step={0.5} className="w-full accent-sky-600" value={platformFee * 100} onChange={(e) => setPlatformFee(Number(e.target.value) / 100)} />
              </Field>
            ) : (
              <Field label="Fee ($/accel-hr)">
                <input type="number" step="0.01" min={0} className={inputCls} value={perHrFee} onChange={(e) => setPerHrFee(Number(e.target.value) || 0)} />
              </Field>
            )}
            <Field label="Fee payer">
              <select className={inputCls} value={feePayer} onChange={(e) => setFeePayer(e.target.value)}>
                <option value="buyer">Buyer pays</option>
                <option value="seller">Seller pays</option>
                <option value="split">Split</option>
              </select>
            </Field>
            {feePayer === 'split' && (
              <Field label={`Buyer's share of fee (${splitPct}%)`}>
                <input type="range" min={0} max={100} className="w-full accent-sky-600" value={splitPct} onChange={(e) => setSplitPct(Number(e.target.value))} />
              </Field>
            )}
            <Field label="Tax rate (%)">
              <input type="number" step="0.5" min={0} className={inputCls} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} />
            </Field>
            <Field label="Partner split (%)">
              <input type="number" step="5" min={0} max={100} className={inputCls} value={partnerSplitPct} onChange={(e) => setPartnerSplitPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
            </Field>
            <Field label="Minimum margin (%)">
              <input type="number" step="0.5" min={0} className={inputCls} value={minMarginPct} onChange={(e) => setMinMarginPct(Number(e.target.value) || 0)} />
            </Field>
          </div>
        </section>

        {/* Live economics */}
        <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Updated economics</h2>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">demo</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat label="Seller price (base)" value={fmtHr(fee.sellerPayout)} note="seller payout" />
            <Stat label="Buyer price" value={fmtHr(fee.buyerPrice)} note="incl. fee + tax" />
            <Stat label="Platform gross revenue" value={fmtUsd(fee.platformGross * 730)} note={`$${fmtHr(fee.platformGross)} / accel-hr`} />
            <Stat label="Partner share (gross)" value={fmtUsd(fee.partner * 730)} note={`$${fmtHr(fee.partner)} / accel-hr`} />
          </div>

          <div className="mt-4 space-y-1.5 border-t border-amber-200 pt-3 text-xs text-slate-600">
            <div className="flex justify-between"><span>Seller payout</span><b>{fmtHr(fee.sellerPayout)} / accel-hr</b></div>
            <div className="flex justify-between"><span>Buyer price</span><b>{fmtHr(fee.buyerPrice)} / accel-hr</b></div>
            <div className="flex justify-between"><span>Platform net (after partner split)</span><b>{fmtUsd(fee.platformNet * 730)} / mo</b></div>
            <div className="flex justify-between"><span>Operator gross margin</span><b className={fee.pass ? 'text-emerald-700' : 'text-rose-700'}>{fee.marginPct.toFixed(1)}%</b></div>
          </div>

          {/* Margin guard (SPEC §9.3) */}
          {showGuard ? (
            <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm">
              <p className="font-semibold text-rose-800">Margin exception — below minimum {minMarginPct}%</p>
              <p className="mt-1 text-xs text-rose-700">
                This quote is below the operator minimum margin ({fee.marginPct.toFixed(1)}%). It cannot be published until an
                authorized operator approves the exception.
              </p>
              <button
                type="button"
                onClick={() => setApproved(true)}
                className="mt-3 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Approve exception (operator)
              </button>
            </div>
          ) : fee.needsApproval && approved ? (
            <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm">
              <p className="font-semibold text-emerald-800">Exception approved by operator</p>
              <p className="mt-1 text-xs text-emerald-700">
                Below-minimum margin override recorded. Original rule, override and approver are retained on the audit record
                (SPEC §9.3).
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-semibold">Margin OK</p>
              <p className="mt-0.5 text-xs text-emerald-700">Above the {minMarginPct}% minimum — this quote can be published.</p>
            </div>
          )}
        </section>
      </div>

      {/* Wave G2 — Recharts visualization section (Sovereign Grid dark theme). */}
      <section className="mt-6" aria-label="Fee engine visualization">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Visualization</h2>
          <span className="rounded bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">live</span>
          <span className="text-xs text-slate-400">derived from the current fee configuration above</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <FeeSensitivityChart rows={sensitivity} />
          <FeeFlowBreakdown flow={flow} effectivePerAccelHr={effectivePerAccelHr} />
          <PartnerSplitView split={split} />
        </div>
      </section>

      <PolicyPanel />
      <p className="mt-4 text-xs text-slate-400">{DEMO_NOTE}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Platform fee policy (SPEC §9.4): operator can GET + edit + PUT the live
// policy; buyers/sellers see a read-only copy. Server is the authority; this
// UI only surfaces role-appropriate controls.
// ---------------------------------------------------------------------------
function PolicyPanel() {
  const { isOperator, user } = useRole()
  const token = getToken()
  const [policy, setPolicy] = useState({ platformFee: 0.08, feeBasis: 'pct', feePayer: 'buyer', splitPct: 50, partnerSplitPct: 30, minMarginPct: 8 })
  const [status, setStatus] = useState(token ? 'loading' : 'offline') // loading | live | offline
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!token) return
    let active = true
    fetchFeePolicy({ token }).then((res) => {
      if (!active) return
      if (res.ok && res.data && res.data.policy) {
        setPolicy(res.data.policy)
        setStatus('live')
      } else {
        setStatus('offline')
      }
    })
    return () => {
      active = false
    }
  }, [token])

  const set = (patch) => {
    setPolicy((p) => ({ ...p, ...patch }))
    setDirty(true)
    setErr(null)
  }

  const onSave = async () => {
    if (!token) return
    setSaving(true)
    setErr(null)
    setSavedAt(null)
    const res = await saveFeePolicy(policy, { token })
    setSaving(false)
    if (res.ok && res.data && res.data.policy) {
      setPolicy(res.data.policy)
      setDirty(false)
      setSavedAt(new Date().toISOString())
    } else {
      setErr(res.offline ? `${res.error} — changes were not saved (API offline).` : res.error)
    }
  }

  const pct = Math.round((policy.platformFee || 0) * 1000) / 10

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm" data-testid="policy-panel">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Platform fee policy</h2>
        {status === 'offline' && <OfflineBadge />}
        {status === 'live' && (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700">live policy</span>
        )}
        {isOperator ? (
          <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">operator edit</span>
        ) : (
          <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">read-only</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Fee basis">
          {isOperator ? (
            <select
              className={inputCls}
              value={policy.feeBasis}
              disabled={saving}
              onChange={(e) => set({ feeBasis: e.target.value })}
            >
              <option value="pct">% of price</option>
              <option value="perHr">$/accel-hr</option>
            </select>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {policy.feeBasis === 'perHr' ? '$/accel-hr' : '% of price'}
            </div>
          )}
        </Field>
        <Field label="Fee payer">
          {isOperator ? (
            <select className={inputCls} value={policy.feePayer} disabled={saving} onChange={(e) => set({ feePayer: e.target.value })}>
              <option value="buyer">Buyer pays</option>
              <option value="seller">Seller pays</option>
              <option value="split">Split</option>
            </select>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm capitalize text-slate-700">{policy.feePayer}</div>
          )}
        </Field>
        <Field label={`Platform fee (${pct.toFixed(1)}%)`}>
          {isOperator ? (
            <input
              type="number"
              step={0.5}
              min={0}
              max={40}
              className={inputCls}
              value={pct}
              disabled={saving}
              onChange={(e) => set({ platformFee: (Number(e.target.value) || 0) / 100 })}
            />
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{pct.toFixed(1)}%</div>
          )}
        </Field>
      </div>

      {policy.feePayer === 'split' && (
        <div className="mt-4 max-w-xs">
          <Field label={`Buyer's share of fee (${policy.splitPct}%)`}>
            {isOperator ? (
              <input
                type="number"
                min={0}
                max={100}
                className={inputCls}
                value={policy.splitPct}
                disabled={saving}
                onChange={(e) => set({ splitPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              />
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{policy.splitPct}%</div>
            )}
          </Field>
        </div>
      )}

      {isOperator && token && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save policy'}
          </button>
          {savedAt && (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Saved by {operatorLabel(user)} · {new Date(savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {err && <span className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">{err}</span>}
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, note }) {
  return (
    <div className="rounded-md border border-amber-200 bg-white p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">demo</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
      {note && <div className="text-[11px] text-slate-400">{note}</div>}
    </div>
  )
}
