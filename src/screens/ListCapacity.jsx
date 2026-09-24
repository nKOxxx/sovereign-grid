// src/screens/ListCapacity.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarket } from '../store/MarketContext.jsx'
import { acceleratorProfiles } from '../data/seed.js'
import { DemoBadge, Field, inputCls } from './ui.jsx'

const ACCEL_KEYS = Object.keys(acceleratorProfiles)
const COUNTRIES = ['Finland', 'Ireland', 'United Arab Emirates', 'USA', 'China', 'Other']

export default function ListCapacity() {
  const { addListing, platformFee } = useMarket()
  const navigate = useNavigate()
  const [f, setF] = useState({
    name: '',
    sellerIdentity: '',
    anonymous: false,
    accel: 'h200',
    count: 128,
    node: '',
    country: 'Finland',
    firmness: 'firm',
    startDate: '2027-01-01',
    minTerm: 12,
    price: 2.1,
    evidenceCount: 2,
    verified: true,
  })

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const setBool = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.checked }))

  const price = Number(f.price) || 0
  const fee = price * platformFee
  const netPayout = price - fee

  function submit(e) {
    e.preventDefault()
    const acc = acceleratorProfiles[f.accel]
    const listing = {
      id: `lst-${Date.now()}`,
      name: f.name || 'New capacity listing',
      seller: { identity: f.anonymous ? null : f.sellerIdentity || 'Seller', anonymous: f.anonymous, entityVerified: !f.anonymous },
      accelerator: { vendor: acc.vendor, model: acc.model, profile: f.accel, origin: acc.origin },
      count: Number(f.count),
      node: f.node || `${f.count}x`,
      software: { frameworks: acc.frameworks.slice(0, 4), compilers: acc.compilers, notes: 'Demo listing.' },
      portability: acc.portability,
      facility: { country: f.country, region: f.country, city: f.country },
      dataResidency: f.country === 'China' ? 'China' : f.country === 'United Arab Emirates' ? 'UAE' : 'EU (GDPR)',
      firmness: f.firmness,
      startDate: f.startDate,
      minTermMonths: Number(f.minTerm),
      maxTermMonths: 60,
      price: { committedPerAccelHr: price, onDemandPerAccelHr: Math.round(price * 1.45 * 100) / 100, currency: 'USD', billingUnit: 'per accelerator-hour' },
      commercial: { minCommitmentMonths: Number(f.minTerm), cancellation: '90 days', renewalOption: true, subleaseAllowed: false, paymentTerms: 'net 30' },
      commitment: { releaseClause: true, minGuaranteed: 0.7 },
      resilience: { slaPct: 99.5, failover: 'single-site', powerBackup: false, score: 70, notes: 'Demo listing.' },
      sovereign: { eligibilityProfile: f.country === 'China' ? 'china-route-review' : 'qualified', dataResidencyPolicy: f.country, personnelAccess: 'Local', governingLaw: f.country, notes: 'Demo listing.' },
      power: { committedMW: 4, curtailment: 0, certainty: 'medium' },
      evidence: Array.from({ length: Math.min(f.evidenceCount, 5) }, (_, i) => ({
        type: 'capacityControl',
        issuer: 'Facility audit',
        date: '2026-09-01',
        status: i === 0 && !f.verified ? 'pending' : 'reviewed',
        scope: 'Demo evidence',
      })),
      verificationStatus: f.verified ? (f.evidenceCount >= 3 ? 'Operationally verified' : 'Capacity evidenced') : 'Unverified',
      evidenceConfidence: f.verified ? 75 : 30,
      leadTimeWeeks: 4,
      provisioning: { onTimePct: 90 },
      tags: ['demo', 'user-listed'],
    }
    addListing(listing)
    navigate('/')
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-slate-500">Seller listing appears in the marketplace. Net payout is a demo preview.</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">List Capacity</h1>
      <p className="mt-1 text-sm text-slate-600">Declare capacity inventory and see the expected net payout before submitting.</p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Listing identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Listing name">
              <input className={inputCls} value={f.name} onChange={set('name')} placeholder="e.g. Helsinki H200 cluster" />
            </Field>
            <Field label="Seller entity">
              <input className={inputCls} value={f.sellerIdentity} onChange={set('sellerIdentity')} placeholder="Legal entity name" />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.anonymous} onChange={setBool('anonymous')} />
            Anonymous listing (capacity discoverable, seller identity hidden until connection approval)
          </label>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Inventory</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Accelerator">
              <select className={inputCls} value={f.accel} onChange={set('accel')}>
                {ACCEL_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {acceleratorProfiles[k].model}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Accelerator count">
              <input type="number" min="1" className={inputCls} value={f.count} onChange={set('count')} />
            </Field>
            <Field label="Node">
              <input className={inputCls} value={f.node} onChange={set('node')} placeholder="e.g. 8x H200" />
            </Field>
            <Field label="Facility country">
              <select className={inputCls} value={f.country} onChange={set('country')}>
                {COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Firmness">
              <select className={inputCls} value={f.firmness} onChange={set('firmness')}>
                <option value="firm">Firm (committed)</option>
                <option value="interruptible">Interruptible-only</option>
              </select>
            </Field>
            <Field label="Available from">
              <input type="date" className={inputCls} value={f.startDate} onChange={set('startDate')} />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Price & evidence</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Committed rate (USD / accel-hr)">
              <input type="number" step="0.05" min="0" className={inputCls} value={f.price} onChange={set('price')} />
            </Field>
            <Field label="Evidence items">
              <input type="number" min="0" max="5" className={inputCls} value={f.evidenceCount} onChange={set('evidenceCount')} />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.verified} onChange={setBool('verified')} />
            I have attached supporting evidence (capacity control, benchmarks, power)
          </label>
          <p className="mt-1 text-xs text-slate-500">
            If unchecked, the listing shows as <b>Unverified</b> until reviewed evidence is attached (SPEC §19.1).
          </p>
        </section>

        {/* Net payout preview */}
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Net payout preview</h2>
            <DemoBadge label="DEMO FEE" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PayoutRow label="List / base rate" value={`$${price.toFixed(2)} / accel-hr`} />
            <PayoutRow label={`Sovereign Grid fee (${(platformFee * 100).toFixed(0)}%)`} value={`-$${fee.toFixed(2)}`} />
            <PayoutRow label="Est. net payout to seller" value={`$${netPayout.toFixed(2)} / accel-hr`} accent />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Demo preview of seller payout on base price. Buyer-facing price includes the fee and is shown separately
            (SPEC §9.2). Not a final commercial policy.
          </p>
        </section>

        <button type="submit" className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
          Submit capacity listing
        </button>
      </form>
    </div>
  )
}

function PayoutRow({ label, value, accent }) {
  return (
    <div className={`rounded-md border p-3 ${accent ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${accent ? 'text-sky-700' : 'text-slate-800'}`}>{value}</div>
    </div>
  )
}
