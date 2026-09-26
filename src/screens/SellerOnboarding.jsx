// src/screens/SellerOnboarding.jsx — Seller onboarding end-to-end (Wave G2).
//
// Two-step flow against the live API:
//   1. Register or sign in as a SELLER (reuses /api/auth/register + /api/auth/login
//      via src/lib/auth.js — no passwords stored client-side, sessions issued by
//      the existing auth flow).
//   2. Create a capacity listing via POST /api/listings (requireRole('seller') on
//      the server). The payload matches the exact shape the route expects
//      (see server/src/routes/listings.js).
//
// House design system only: dark .sg-* tokens, custom Select (never native
// <select>), zero light-theme Tailwind classes. Guarded by
// src/screens/seller-onboarding.test.jsx.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { login, register, logout, getCurrentUser, getToken } from '../lib/auth.js'
import { api } from '../lib/api.js'
import { acceleratorProfiles } from '../data/seed.js'
import { DemoBadge, Field, inputCls } from './ui.jsx'
import Select from '../components/Select.jsx'

// GPU vocabulary from the bundled accelerator profiles (src/data/seed.js).
const GPU_VOCAB = Object.entries(acceleratorProfiles).map(([profile, p]) => ({
  profile,
  label: `${p.vendor} ${p.model}`,
  providerType: p.vendor,
  gpuModel: p.model,
}))

const REGIONS = ['EU', 'GCC']
const MODE_LABELS = { login: 'Log in', register: 'Create seller account' }

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[color:var(--sg-border)] pb-2">
      <dt className="text-text-3">{k}</dt>
      <dd className="text-right text-text-1">{v}</dd>
    </div>
  )
}

export default function SellerOnboarding() {
  const [user, setUser] = useState(getCurrentUser())
  const [mode, setMode] = useState('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authError, setAuthError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [region, setRegion] = useState(REGIONS[0])
  const [gpuLabel, setGpuLabel] = useState(GPU_VOCAB[0]?.label ?? '')
  const [price, setPrice] = useState('2.50')
  const [availability, setAvailability] = useState('168')
  const [description, setDescription] = useState('')
  const [listError, setListError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState(null)

  const isSeller = Boolean(user && user.role === 'seller')
  const isWrongRole = Boolean(user && user.role !== 'seller')
  const hourly = Number(price) || 0

  async function submitAuth(e) {
    e.preventDefault()
    setAuthError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        await register({
          email: email.trim(),
          password,
          role: 'seller',
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        })
      }
      const u = getCurrentUser()
      setUser(u)
      if (u && u.role !== 'seller') {
        setAuthError('That account is not a seller. Listings require a seller account.')
      }
    } catch (err) {
      setAuthError(err && err.message ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  async function submitListing(e) {
    e.preventDefault()
    setListError(null)
    setSubmitting(true)
    const gpu = GPU_VOCAB.find((g) => g.label === gpuLabel) ?? GPU_VOCAB[0]
    try {
      const { listing } = await api.post(
        '/listings',
        {
          name: name.trim(),
          provider_type: gpu.providerType,
          gpu_model: gpu.gpuModel,
          region,
          count: 1,
          on_demand_price: hourly,
          currency: 'USD',
          software: {
            description: description.trim(),
            availabilityHoursPerWeek: Number(availability) || 0,
          },
        },
        { token: getToken() },
      )
      setCreated({ ...listing, gpuLabel: gpu.label })
    } catch (err) {
      setListError(err && err.message ? err.message : 'Could not create listing')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    await logout()
    setUser(null)
    setCreated(null)
    setAuthError(null)
  }

  // Confirmation state with listing summary + link to the marketplace.
  if (created) {
    const createdPrice = Number(created.on_demand_price) || 0
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-2 flex items-center gap-2">
          <DemoBadge label="LIVE API" />
          <span className="text-xs text-text-3">Listing published to the marketplace.</span>
        </div>
        <h1 className="sg-display text-2xl">Listing live</h1>
        <p className="mt-1 max-w-xl text-sm text-text-2">
          Your capacity is now visible to buyers as an anonymized, contact-less summary — no seller identity or pricing
          details leak through the public view.
        </p>
        <section className="sg-card mt-6 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-3">Listing summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row k="Name" v={created.name} />
            <Row k="Region" v={created.region} />
            <Row k="GPU type" v={created.gpuLabel} />
            <Row
              k="Hourly price"
              v={<span className="sg-num">${createdPrice.toFixed(2)} / accel-hr</span>}
            />
            <Row k="Availability" v={<span className="sg-num">{Number(created.software?.availabilityHoursPerWeek) || 0} hrs/wk</span>} />
          </dl>
        </section>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/" className="sg-btn sg-btn--primary">
            View marketplace →
          </Link>
          <button type="button" onClick={() => setCreated(null)} className="sg-btn sg-btn--ghost">
            Create another
          </button>
        </div>
      </div>
    )
  }

  // Authenticated seller — create a listing.
  if (isSeller) {
    const availabilityNum = Math.max(0, Math.min(168, Number(availability) || 0))
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-2 flex items-center gap-2">
          <DemoBadge label="LIVE API" />
          <span className="text-xs text-text-3">Seller onboarding — publish capacity.</span>
        </div>
        <h1 className="sg-display text-2xl">Create listing</h1>
        <p className="mt-1 max-w-xl text-sm text-text-2">
          Signed in as <span className="text-text-1">{user.email}</span> ({user.role}). Publish your idle GPU capacity to the
          marketplace for buyers to discover.
        </p>

        <form onSubmit={submitListing} className="mt-6 space-y-4">
          <section className="sg-card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-3">Listing details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Listing name">
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. H200 rack — Frankfurt primary"
                  required
                />
              </Field>
              <Field label="Region">
                <Select value={region} onChange={setRegion} options={REGIONS} label="Region" />
              </Field>
              <Field label="GPU type">
                <Select
                  value={gpuLabel}
                  onChange={setGpuLabel}
                  options={GPU_VOCAB.map((g) => g.label)}
                  label="GPU type"
                />
              </Field>
              <Field label="Hourly price ($/accel-hr)">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                  <span className="sg-num whitespace-nowrap text-sm text-text-2">${hourly.toFixed(2)}</span>
                </div>
              </Field>
              <Field label="Availability (hours/week)">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="168"
                  className={inputCls}
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                />
              </Field>
              <Field label="Description (contact-less)">
                <input
                  className={inputCls}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Stack, power, SLA — no contact details"
                />
              </Field>
            </div>
            {listError && (
              <p className="mt-4 rounded-md border border-[color:var(--sg-danger)] bg-[color:var(--sg-danger-dim)] px-3 py-2 text-sm text-danger">
                {listError}
              </p>
            )}
            <div className="mt-5 flex items-center justify-between border-t border-[color:var(--sg-border)] pt-4">
              <button type="button" onClick={handleLogout} className="text-xs text-text-3 hover:text-text-1">
                Log out
              </button>
              <button type="submit" disabled={submitting} className="sg-btn sg-btn--primary">
                {submitting ? 'Publishing…' : 'Publish listing'}
              </button>
            </div>
          </section>
          <p className="text-xs text-text-4">
            Availability: {availabilityNum} hrs/week. Net payout is previewed in the calculator; the platform fee is applied at
            trade time.
          </p>
        </form>
      </div>
    )
  }

  // Logged-out (or wrong-role) — register or sign in as a seller.
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge label="LIVE API" />
        <span className="text-xs text-text-3">Seller onboarding — list idle GPU capacity.</span>
      </div>
      <h1 className="sg-display text-2xl">Sell compute</h1>
      <p className="mt-1 max-w-xl text-sm text-text-2">
        Sign in as a seller to publish capacity on the marketplace. New here? Create a seller account in seconds — passwords are
        hashed server-side and never stored by the app.
      </p>

      {isWrongRole && (
        <div className="mt-4 rounded-md border border-[color:var(--sg-warning)] bg-[color:var(--sg-warning-dim)] p-3 text-sm">
          <p className="font-semibold text-warning">
            {user.email} is {user.role === 'buyer' ? 'a buyer' : `an ${user.role}`} account.
          </p>
          <p className="mt-1 text-xs text-text-2">
            Only sellers can publish listings. Log out and create a seller account, or browse the marketplace.
          </p>
        </div>
      )}

      <form onSubmit={submitAuth} className="mt-6 space-y-4">
        <section className="sg-card p-5">
          <div className="mb-4 flex gap-2">
            {(['register', 'login']).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setAuthError(null)
                }}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  mode === m ? 'bg-accent text-white' : 'border border-[color:var(--sg-border)] bg-elevated text-text-2'
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          {mode === 'register' && (
            <Field label="Seller name (optional)">
              <input
                className={inputCls}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your company or handle"
              />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
          {mode === 'register' && (
            <p className="text-xs text-text-3">
              Registering creates a <span className="text-text-1">seller</span> account. Operator accounts are provisioned by
              admins and cannot self-register.
            </p>
          )}
          {authError && (
            <p className="rounded-md border border-[color:var(--sg-danger)] bg-[color:var(--sg-danger-dim)] px-3 py-2 text-sm text-danger">
              {authError}
            </p>
          )}
          <button type="submit" disabled={busy} className="sg-btn sg-btn--primary mt-2 w-full">
            {busy ? 'Working…' : MODE_LABELS[mode]}
          </button>
        </section>
      </form>
      <p className="mt-3 text-center text-xs text-text-4">
        <Link to="/" className="text-text-3 hover:text-text-1">
          ← Back to marketplace
        </Link>
      </p>
    </div>
  )
}
