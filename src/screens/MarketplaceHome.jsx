// src/screens/MarketplaceHome.jsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarket } from '../store/MarketContext.jsx'
import { acceleratorProfiles } from '../data/seed.js'
import { DemoBadge, VerifiedPill } from './ui.jsx'

const VENDOR_OPTIONS = ['All vendors', 'NVIDIA', 'AMD', 'Huawei', 'Google']
const REGION_OPTIONS = ['All regions', 'EU', 'UAE', 'US', 'China']
const FIRMNESS_OPTIONS = ['All firmness', 'firm', 'interruptible']

function regionOf(listing) {
  const c = (listing.facility && listing.facility.country) || ''
  if (/finland|ireland/i.test(c)) return 'EU'
  if (/emirates/i.test(c)) return 'UAE'
  if (/usa|united states/i.test(c)) return 'US'
  if (/china/i.test(c)) return 'China'
  return c
}

export default function MarketplaceHome() {
  const { listings, requests, demoNote } = useMarket()
  const [vendor, setVendor] = useState('All vendors')
  const [region, setRegion] = useState('All regions')
  const [firmness, setFirmness] = useState('All firmness')

  const filtered = useMemo(
    () =>
      listings.filter((l) => {
        const v = (l.accelerator && l.accelerator.vendor) || ''
        if (vendor !== 'All vendors' && v !== vendor) return false
        if (region !== 'All regions' && regionOf(l) !== region) return false
        if (firmness !== 'All firmness' && (l.firmness || '') !== firmness) return false
        return true
      }),
    [listings, vendor, region, firmness],
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-slate-500">{demoNote}</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Marketplace</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        A broker-assisted, accelerator-neutral marketplace for verified compute. Browse supply, then compare
        normalized offers. Sellers' claims appear as <b>Unverified</b> until reviewed evidence is attached.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Supply */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Supply listings ({filtered.length})</h2>
            <Link
              to="/list-capacity"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              + List capacity
            </Link>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <FilterSelect value={vendor} onChange={setVendor} options={VENDOR_OPTIONS} label="Vendor" />
            <FilterSelect value={region} onChange={setRegion} options={REGION_OPTIONS} label="Region" />
            <FilterSelect value={firmness} onChange={setFirmness} options={FIRMNESS_OPTIONS} label="Firmness" />
          </div>

          <div className="space-y-3">
            {filtered.length === 0 && (
              <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                No listings match the current filters.
              </p>
            )}
            {filtered.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        </section>

        {/* Demand */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Open buyer requests ({requests.length})</h2>
            <Link
              to="/post-demand"
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              + Post demand
            </Link>
          </div>
          <div className="space-y-3">
            {requests.map((r) => (
              <RequestCard key={r.id} request={r} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function FilterSelect({ value, onChange, options, label }) {
  return (
    <label className="flex items-center gap-1 text-xs text-slate-600">
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}

function ListingCard({ listing }) {
  const l = listing
  const acc = acceleratorProfiles[l.accelerator.profile]
  const anonymous = l.seller && l.seller.anonymous
  const price = l.price ? l.price.committedPerAccelHr : null
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">
            {l.name}
            {anonymous && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">Anonymous</span>}
            {!acc.vendor.includes('NVIDIA') && (
              <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] text-indigo-700">non-NVIDIA</span>
            )}
          </h3>
          <p className="text-xs text-slate-500">
            {anonymous ? 'Seller identity hidden until connection approval' : l.seller.identity} ·{' '}
            {l.facility.country}
          </p>
        </div>
        <VerifiedPill listing={l} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label="Accelerator" value={`${acc.model}`} />
        <Stat label="Count" value={`${l.count}`} />
        <Stat label="Firmness" value={l.firmness} />
        <Stat label="Start" value={l.startDate} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-600">
          {price !== null ? (
            <>
              <span className="text-base font-semibold text-slate-900">${price.toFixed(2)}</span>
              <span className="text-xs text-slate-500">/accel-hr committed</span>
            </>
          ) : (
            'price on request'
          )}
        </span>
        <span className="text-xs text-slate-400">
          {l.evidence.length} evidence item{l.evidence.length === 1 ? '' : 's'} on file
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="truncate text-sm text-slate-800">{value}</div>
    </div>
  )
}

function RequestCard({ request }) {
  const isGolden = request.golden
  const acc = acceleratorProfiles[request.accelerator.preferred]
  return (
    <div
      className={`rounded-lg border p-4 shadow-sm ${isGolden ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">
          {request.name}
          {isGolden && (
            <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
              Golden scenario
            </span>
          )}
        </h3>
        <DemoBadge />
      </div>
      <p className="text-xs text-slate-500">{request.company}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Stat label="Preferred" value={acc ? acc.model : request.accelerator.preferred} />
        <Stat label="Count" value={`${request.count}`} />
        <Stat label="Term" value={`${request.termMonths} mo`} />
        <Stat label="Start" value={request.startDate} />
        <Stat label="Locations" value={`${request.location.primary.join('/')}${request.location.failover.length ? ' + ' + request.location.failover.join('/') : ''}`} />
        <Stat label="Firmness" value={request.firmness} />
      </div>
      {isGolden && (
        <div className="mt-3 border-t border-amber-200 pt-3">
          <p className="text-sm text-amber-900">
            {request.summary.headline} —{' '}
            <Link to="/matches" className="font-semibold underline">
              View normalized matches
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
