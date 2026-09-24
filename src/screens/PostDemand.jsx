// src/screens/PostDemand.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMarket } from '../store/MarketContext.jsx'
import { acceleratorProfiles } from '../data/seed.js'
import { api } from '../lib/api.js'
import { getToken } from '../lib/auth.js'
import { requestToPayload } from '../lib/apiMappers.js'
import { DemoBadge, Field, inputCls } from './ui.jsx'

const ACCEL_KEYS = Object.keys(acceleratorProfiles)
const REGIONS = ['Finland', 'Ireland', 'United Arab Emirates', 'USA', 'China', 'Other']
const WORKLOAD_TYPES = ['training', 'fine-tuning', 'inference', 'rendering', 'simulation', 'agent runtime']

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
        <span className="text-xs text-slate-500">Creates a request into the demo market; appears on the home screen.</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Post Demand</h1>
      <p className="mt-1 text-sm text-slate-600">Publish a structured buyer request to receive normalized, eligible offers.</p>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Workload & identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Request name">
              <input className={inputCls} value={f.name} onChange={set('name')} placeholder="e.g. Project Falcon" />
            </Field>
            <Field label="Buyer company">
              <input className={inputCls} value={f.company} onChange={set('company')} placeholder="e.g. European AI company" />
            </Field>
            <Field label="Workload type">
              <select className={inputCls} value={f.workloadType} onChange={set('workloadType')}>
                {WORKLOAD_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Workload description">
              <input className={inputCls} value={f.workloadDesc} onChange={set('workloadDesc')} placeholder="Model, workload objective…" />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Accelerator & capacity</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Preferred accelerator">
              <select className={inputCls} value={f.preferred} onChange={set('preferred')}>
                {ACCEL_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {acceleratorProfiles[k].model}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Accelerator count">
              <input type="number" min="32" className={inputCls} value={f.count} onChange={set('count')} />
            </Field>
            <Field label="Node">
              <input className={inputCls} value={f.node} onChange={set('node')} placeholder="e.g. 8x H200" />
            </Field>
          </div>
          <div className="mt-4">
            <span className="mb-1 block text-xs font-medium text-slate-600">Acceptable alternatives (accepts non-NVIDIA)</span>
            <div className="flex flex-wrap gap-2">
              {ACCEL_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-sm">
                  <input type="checkbox" checked={f.alternatives.includes(k)} onChange={() => toggleAlt(k)} />
                  {acceleratorProfiles[k].model}
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Location, jurisdiction & data policy</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Primary deployment region">
              <select className={inputCls} value={f.primary} onChange={set('primary')}>
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Failover region (optional)">
              <select className={inputCls} value={f.failover} onChange={set('failover')}>
                <option value="">None</option>
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Data residency">
              <select className={inputCls} value={f.dataResidency} onChange={set('dataResidency')}>
                <option>EU (GDPR)</option>
                <option>UAE</option>
                <option>US</option>
                <option>China</option>
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" className={inputCls} value={f.startDate} onChange={set('startDate')} />
            </Field>
            <Field label="Term (years)">
              <select className={inputCls} value={f.termYears} onChange={set('termYears')}>
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={y}>
                    {y} year{y > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Firmness">
              <select className={inputCls} value={f.firmness} onChange={set('firmness')}>
                <option value="firm">Firm (committed)</option>
                <option value="interruptible">Interruptible acceptable</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 space-y-2">
            {[
              ['zeroRetention', 'Zero-data-retention required'],
              ['euCompliant', 'EU-compliant processing required'],
              ['releaseUnused', 'Option to release unused capacity'],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={f[k]} onChange={setBool(k)} />
                {label}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.chinaPolicy} onChange={setBool('chinaPolicy')} />
              China policy: route-specific review required (never blanket exclusion)
            </label>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Publish demand request
          </button>
          <span className="text-xs text-slate-500">Request is created into app state and shown on the marketplace.</span>
        </div>
      </form>
    </div>
  )
}
