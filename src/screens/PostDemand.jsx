// src/screens/PostDemand.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarket } from '../store/MarketContext.jsx'
import { acceleratorProfiles } from '../data/seed.js'
import { api } from '../lib/api.js'
import { getToken } from '../lib/auth.js'
import { requestToPayload } from '../lib/apiMappers.js'
import { DemoBadge, Field, inputCls } from './ui.jsx'
import Select from '../components/Select.jsx'

const ACCEL_KEYS = Object.keys(acceleratorProfiles)
const REGIONS = ['Finland', 'Ireland', 'United Arab Emirates', 'USA', 'China', 'Other']
const WORKLOAD_TYPES = ['training', 'fine-tuning', 'inference', 'rendering', 'simulation', 'agent runtime']
const DATA_RESIDENCY = ['EU (GDPR)', 'UAE', 'US', 'China']
const FIRMNESS_LABELS = { firm: 'Firm (committed)', interruptible: 'Interruptible acceptable' }
const TERM_YEARS = [1, 2, 3, 4, 5]
const TERM_LABELS = TERM_YEARS.map((y) => `${y} year${y > 1 ? 's' : ''}`)

export default function PostDemand() {
  const { addRequest } = useMarket()
  const navigate = useNavigate()
  const [f, setF] = useState({
    name: '',
    company: '',
    preferred: 'h200',
    alternatives: ['mi300x'],
    count: 64,
    node: '',
    workloadType: 'training',
    workloadDesc: '',
    primary: 'Finland',
    failover: 'United Arab Emirates',
    dataResidency: 'EU (GDPR)',
    startDate: '2027-01-01',
    termYears: 2,
    firmness: 'firm',
    zeroRetention: true,
    euCompliant: true,
    releaseUnused: true,
    chinaPolicy: true,
  })

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const setBool = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.checked }))

  const toggleAlt = (key) => {
    setF((p) => {
      const alts = p.alternatives.includes(key)
        ? p.alternatives.filter((a) => a !== key)
        : [...p.alternatives, key]
      return { ...p, alternatives: alts }
    })
  }

  const onPreferred = (model) => {
    const hit = ACCEL_KEYS.find((k) => acceleratorProfiles[k].model === model)
    setF((p) => ({ ...p, preferred: hit ? hit : p.preferred }))
  }
  const onWorkload = (t) => setF((p) => ({ ...p, workloadType: t }))
  const onPrimary = (r) => setF((p) => ({ ...p, primary: r }))
  const onFailover = (v) => setF((p) => ({ ...p, failover: v === 'None' ? '' : v }))
  const onResidency = (r) => setF((p) => ({ ...p, dataResidency: r }))
  const onTerm = (label) => {
    const y = TERM_YEARS[TERM_LABELS.indexOf(label)]
    setF((p) => ({ ...p, termYears: y != null ? y : p.termYears }))
  }
  const onFirmness = (label) => {
    const hit = Object.keys(FIRMNESS_LABELS).find((k) => FIRMNESS_LABELS[k] === label)
    setF((p) => ({ ...p, firmness: hit ? hit : p.firmness }))
  }

  async function submit(e) {
    e.preventDefault()
    const request = {
      id: `req-${Date.now()}`,
      name: f.name || 'Untitled request',
      company: f.company || 'Buyer (anonymous)',
      accelerator: { preferred: f.preferred, alternatives: f.alternatives },
      count: Number(f.count),
      node: f.node || `${f.count}x`,
      workloadType: f.workloadType,
      workload: {
        description: f.workloadDesc || 'Workload to be sized by broker.',
        frameworks: ['PyTorch'],
        utilization: 0.65,
      },
      location: {
        primary: [f.primary],
        failover: f.failover ? [f.failover] : [],
        prohibited: [],
        chinaPolicy: f.chinaPolicy ? 'route-specific review required' : 'none',
        dataResidency: f.dataResidency,
        personnelAccess: 'EU personnel only',
      },
      startDate: f.startDate,
      termMonths: Number(f.termYears) * 12,
      termYears: Number(f.termYears),
      firmness: f.firmness,
      resilience: { maxOutage: '4h', failoverRequired: !!(f.failover), multiSite: false },
      compliance: {
        zeroDataRetention: f.zeroRetention,
        euCompliant: f.euCompliant,
        certifications: [],
      },
      options: { releaseUnused: f.releaseUnused },
      budget: { monthly: null, total: null, label: 'demo — internal budget, not disclosed to sellers' },
      privacy: { discloseBudget: false, discloseIdentity: false },
      tags: ['demo', 'user-created'],
    }
    // When authenticated, publish to the live API; on any failure fall back to
    // the in-app (seed) store so posting still works with the backend down.
    const token = getToken()
    if (token) {
      try {
        await api.post('/requests', requestToPayload(request), { token })
        navigate('/')
        return
      } catch {
        // fall through to local state
      }
    }
    addRequest(request)
    navigate('/')
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-2 flex items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-text-3">Creates a request into the demo market; appears on the home screen.</span>
      </div>
      <h1 className="sg-display text-2xl">Post Demand</h1>
      <p className="mt-1 text-sm text-text-2">Publish a structured buyer request to receive normalized, eligible offers.</p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <section className="sg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-text-2">Workload & identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Request name">
              <input className={inputCls} value={f.name} onChange={set('name')} placeholder="e.g. Project Falcon" />
            </Field>
            <Field label="Buyer company">
              <input className={inputCls} value={f.company} onChange={set('company')} placeholder="e.g. European AI company" />
            </Field>
            <Field label="Workload type">
              <Select value={f.workloadType} onChange={onWorkload} options={WORKLOAD_TYPES} label="Workload type" />
            </Field>
            <Field label="Workload description">
              <input className={inputCls} value={f.workloadDesc} onChange={set('workloadDesc')} placeholder="Model, workload objective…" />
            </Field>
          </div>
        </section>

        <section className="sg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-text-2">Accelerator & capacity</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Preferred accelerator">
              <Select
                value={acceleratorProfiles[f.preferred]?.model}
                onChange={onPreferred}
                options={ACCEL_KEYS.map((k) => acceleratorProfiles[k].model)}
                label="Preferred accelerator"
              />
            </Field>
            <Field label="Accelerator count">
              <input type="number" min="32" className={inputCls} value={f.count} onChange={set('count')} />
            </Field>
            <Field label="Node">
              <input className={inputCls} value={f.node} onChange={set('node')} placeholder="e.g. 8x H200" />
            </Field>
          </div>
          <div className="mt-4">
            <span className="mb-1 block text-xs font-medium text-text-2">Acceptable alternatives (accepts non-NVIDIA)</span>
            <div className="flex flex-wrap gap-2">
              {ACCEL_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-1.5 rounded-md border border-[color:var(--sg-border)] bg-elevated px-2.5 py-1 text-sm">
                  <input type="checkbox" checked={f.alternatives.includes(k)} onChange={() => toggleAlt(k)} />
                  {acceleratorProfiles[k].model}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="sg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-text-2">Location, jurisdiction & data policy</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary deployment region">
              <Select value={f.primary} onChange={onPrimary} options={REGIONS} label="Primary deployment region" />
            </Field>
            <Field label="Failover region (optional)">
              <Select value={f.failover || 'None'} onChange={onFailover} options={['None', ...REGIONS]} label="Failover region (optional)" />
            </Field>
            <Field label="Data residency">
              <Select value={f.dataResidency} onChange={onResidency} options={DATA_RESIDENCY} label="Data residency" />
            </Field>
            <Field label="Start date">
              <input type="date" className={inputCls} value={f.startDate} onChange={set('startDate')} />
            </Field>
            <Field label="Term (years)">
              <Select value={TERM_LABELS[TERM_YEARS.indexOf(f.termYears)]} onChange={onTerm} options={TERM_LABELS} label="Term (years)" />
            </Field>
            <Field label="Firmness">
              <Select value={FIRMNESS_LABELS[f.firmness]} onChange={onFirmness} options={Object.values(FIRMNESS_LABELS)} label="Firmness" />
            </Field>
          </div>

          <div className="mt-4 space-y-2">
            {[
              ['zeroRetention', 'Zero-data-retention required'],
              ['euCompliant', 'EU-compliant processing required'],
              ['releaseUnused', 'Option to release unused capacity'],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-text-2">
                <input type="checkbox" checked={f[k]} onChange={setBool(k)} />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-text-2">
              <input type="checkbox" checked={f.chinaPolicy} onChange={setBool('chinaPolicy')} />
              China policy: route-specific review required (never blanket exclusion)
            </label>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="sg-btn sg-btn--primary"
          >
            Publish demand request
          </button>
          <span className="text-xs text-text-3">Request is created into app state and shown on the marketplace.</span>
        </div>
      </form>
    </div>
  )
}
