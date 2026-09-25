// src/screens/MarketplaceHome.jsx
// Wave G visual redesign: dark canvas, Aurora hero behind a .sg-display
// headline, KPI strip (derived aggregates), custom popover-based Select filter
// row, and supply listings as .sg-card tiles with tabular prices + status
// pills. Offline fallback (seed + 'API offline' badge) is preserved, as are all
// data-testid / aria-label hooks used by e2e/verify_demo.py and
// e2e/sweep_buttons.py.
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarket } from '../store/MarketContext.jsx'
import { acceleratorProfiles } from '../data/seed.js'
import { api } from '../lib/api.js'
import { getToken } from '../lib/auth.js'
import { marketplaceRowToListing, requestRowToCard } from '../lib/apiMappers.js'
import { DemoBadge, OfflineBadge } from './ui.jsx'
import Select from '../components/Select.jsx'
import Aurora from '../components/Aurora.jsx'
import './wave-g.css'

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
  const { listings: seedListings, requests: seedRequests, demoNote } = useMarket()
  const [listings, setListings] = useState(seedListings)
  const [requests, setRequests] = useState(seedRequests)
  const [offline, setOffline] = useState(false)
  const [vendor, setVendor] = useState('All vendors')
  const [region, setRegion] = useState('All regions')
  const [firmness, setFirmness] = useState('All firmness')

  useEffect(() => {
    let active = true
    setOffline(false)
    // GET /api/marketplace (public, anonymous). Fall back to seed on failure.
    api
      .get('/marketplace')
      .then((d) => {
        if (!active) return
        if (d && Array.isArray(d.listings) && d.listings.length > 0) {
          setListings(d.listings.map(marketplaceRowToListing))
        }
      })
      .catch(() => {
        if (!active) return
        setListings(seedListings)
        setOffline(true)
      })

    // GET /api/requests (requires auth) -> demand column. Seed fallback if absent.
    const token = getToken()
    if (token) {
      api
        .get('/requests', { token })
        .then((d) => {
          if (!active) return
          if (d && Array.isArray(d.requests)) setRequests(d.requests.map(requestRowToCard))
        })
        .catch(() => {
          if (!active) return
          setRequests(seedRequests)
        })
    }
    return () => {
      active = false
    }
  }, [seedListings, seedRequests])

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

  // Aggregate KPIs derivable from the supply data (count, total accelerators,
  // committed price floor/ceiling). Rendered only when data is present.
  const kpi = useMemo(() => {
    if (!listings.length) return null
    const prices = listings
      .map((l) => l.price && l.price.committedPerAccelHr)
      .filter((n) => typeof n === 'number')
    return {
      listings: listings.length,
      accelerators: listings.reduce((s, l) => s + (l.count || 0), 0),
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
    }
  }, [listings])

  return (
    <div className="sg-root sg-mkt min-h-screen bg-canvas">
      <header className="sg-hero">
        <Aurora className="sg-aurora" style={{ opacity: 0.34 }} speed={0.9} />
        <div className="sg-hero__inner mx-auto max-w-6xl px-4 pt-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <DemoBadge />
            {offline && <OfflineBadge />}
            <span className="text-xs text-text-3">{demoNote}</span>
          </div>
          <h1 className="sg-display max-w-2xl text-4xl sm:text-5xl">Marketplace</h1>
          <p className="mt-3 max-w-3xl text-sm text-text-2">
            A broker-assisted, accelerator-neutral marketplace for verified compute. Browse supply, then compare
            normalized offers. Sellers' claims appear as <b className="text-text-1">Unverified</b> until reviewed
            evidence is attached.
          </p>
        </div>
        {kpi && (
          <div className="sg-kpi-row mx-auto max-w-6xl px-4 pt-8">
            <Kpi label="Supply listings" value={kpi.listings} />
            <Kpi label="Total accelerators" value={kpi.accelerators.toLocaleString()} />
            <Kpi label="Committed price floor" value={kpi.minPrice != null ? `$${kpi.minPrice.toFixed(2)}` : '—'} suffix="/accel-hr" />
            <Kpi label="Committed price ceiling" value={kpi.maxPrice != null ? `$${kpi.maxPrice.toFixed(2)}` : '—'} suffix="/accel-hr" />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-10 pt-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Supply */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-1">Supply listings ({filtered.length})</h2>
              <Link to="/list-capacity" className="sg-btn sg-btn--primary text-sm">
                + List capacity
              </Link>
            </div>
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
              <Select value={vendor} onChange={setVendor} options={VENDOR_OPTIONS} label="Vendor" />
              <Select value={region} onChange={setRegion} options={REGION_OPTIONS} label="Region" />
              <Select value={firmness} onChange={setFirmness} options={FIRMNESS_OPTIONS} label="Firmness" />
            </div>
            {filtered.length === 0 && (
              <p className="sg-empty rounded-md p-4 text-sm text-text-3">
                No listings match the current filters.
              </p>
            )}
            <div className="sg-listing-grid">
              {filtered.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          </section>

          {/* Demand */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-1">Open buyer requests ({requests.length})</h2>
              <Link to="/post-demand" className="sg-btn sg-btn--primary text-sm">
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
      </main>
    </div>
  )
}

function Kpi({ label, value, suffix }) {
  return (
    <div className="sg-card sg-kpi">
      <div className="sg-kpi__label">{label}</div>
      <div className="sg-kpi__value sg-num">
        {value}
        {suffix && <span className="ml-1 text-sm font-normal text-text-3">{suffix}</span>}
      </div>
    </div>
  )
}

function ListingCard({ listing }) {
  const l = listing
  const acc = acceleratorProfiles[l.accelerator.profile]
  const anonymous = l.seller && l.seller.anonymous
  const price = l.price ? l.price.committedPerAccelHr : null
  const hasEvidence = Array.isArray(l.evidence) && l.evidence.length > 0
  const unverified = !hasEvidence || /^unverified$/i.test(l.verificationStatus || '')

  return (
    <article className="sg-card sg-card--hover flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="sg-display text-base">{l.name}</h3>
          <p className="mt-0.5 text-xs text-text-3">
            {anonymous ? 'Seller identity hidden until connection approval' : l.seller.identity} ·{' '}
            {l.facility.country}
          </p>
        </div>
        <span className={`sg-pill shrink-0 ${unverified ? '' : 'sg-pill--success'}`}>
          {unverified ? 'Unverified' : l.verificationStatus}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {anonymous && <span className="sg-pill">Anonymous</span>}
        {!acc.vendor.includes('NVIDIA') && <span className="sg-pill sg-pill--accent">non-NVIDIA</span>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Accelerator" value={acc.model} />
        <Stat label="Count" value={String(l.count)} />
        <Stat label="Firmness" value={l.firmness} />
        <Stat label="Start" value={l.startDate} />
      </dl>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <span className="text-sm">
          {price !== null ? (
            <>
              <span className="sg-num text-lg text-text-1">${price.toFixed(2)}</span>
              <span className="text-xs text-text-3">/accel-hr committed</span>
            </>
          ) : (
            'price on request'
          )}
        </span>
        <span className="text-xs text-text-4">
          {l.evidence.length} evidence item{l.evidence.length === 1 ? '' : 's'}
        </span>
      </div>
    </article>
  )
}

function Stat({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="sg-stat__label">{label}</dt>
      <dd className="sg-stat__value break-words">{value}</dd>
    </div>
  )
}

function RequestCard({ request }) {
  const isGolden = request.golden
  const acc = acceleratorProfiles[request.accelerator.preferred]
  return (
    <div className={`sg-card p-4 ${isGolden ? 'sg-card--golden' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="sg-display text-base">
          {request.name}
          {isGolden && <span className="sg-pill sg-pill--accent ml-2">Golden scenario</span>}
        </h3>
        <DemoBadge />
      </div>
      <p className="mt-0.5 text-xs text-text-3">{request.company}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Stat label="Preferred" value={acc ? acc.model : request.accelerator.preferred} />
        <Stat label="Count" value={String(request.count)} />
        <Stat label="Term" value={`${request.termMonths} mo`} />
        <Stat label="Start" value={request.startDate} />
        <Stat
          label="Locations"
          value={`${request.location.primary.join('/')}${request.location.failover.length ? ' + ' + request.location.failover.join('/') : ''}`}
        />
        <Stat label="Firmness" value={request.firmness} />
      </dl>
      {isGolden && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="text-sm text-text-2">
            {request.summary.headline} —{' '}
            <Link to="/matches" className="font-semibold text-accent underline">
              View normalized matches
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
