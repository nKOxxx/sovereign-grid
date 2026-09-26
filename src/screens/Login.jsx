// src/screens/Login.jsx — Wave D auth UI.
// Login / register with the live API; persists the session token via
// src/lib/auth.js. Shows the seeded demo credentials as a hint. If already
// authenticated, shows the current user with a logout control.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register, logout, getCurrentUser } from '../lib/auth.js'
import { DemoBadge, Field, inputCls } from './ui.jsx'

// Seeded demo buyer account (server `npm run seed`). Operator accounts are
// provisioned by admins and are invite-only in this demo.
export const DEMO_CREDS = [{ role: 'Buyer (Project Falcon)', email: 'falcon@demo.local', password: 'sg-falcon-dev' }]

const MODE_LABELS = { login: 'Log in', register: 'Create account' }

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('buyer')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [user, setUser] = useState(getCurrentUser())

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const u =
        mode === 'login'
          ? await login(email.trim(), password)
          : await register({ email: email.trim(), password, role })
      setUser(u || getCurrentUser())
      // Golden path convenience: after login, jump to match results.
      navigate('/matches')
    } catch (err) {
      setError(err && err.message ? err.message : 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    await logout()
    setUser(null)
    setEmail('')
    setPassword('')
    navigate('/')
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="sg-card p-6">
          <DemoBadge label="AUTHENTICATED" />
          <h1 className="sg-display mt-2 text-xl">Signed in</h1>
          {user.email && <p className="mt-1 text-sm text-text-2">{user.email}</p>}
          {user.role && (
            <span className="mt-2 inline-block rounded bg-[color:var(--sg-accent-dim)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
              {user.role}
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="sg-btn bg-elevated mt-6 px-4 py-2 text-sm font-semibold text-text-1 hover:bg-[color:var(--sg-border)]"
          >
            Log out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="mb-3 flex items-center gap-2">
        <DemoBadge />
        <span className="text-xs text-text-3">Live API authentication — demo credentials below.</span>
      </div>
      <h1 className="sg-display text-2xl">Sign in to Sovereign Grid</h1>
      <p className="mt-1 text-sm text-text-2">
        Requests and matches need an authenticated buyer. In the demo you can use the seeded Falcon account to run the
        golden path (matches 93 / 90 / 87).
      </p>

      <div className="sg-card mt-6 p-6">
        <div className="mb-4 flex gap-2">
          {(['login', 'register']).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                setError(null)
              }}
              className={`rounded-md px-3 py-1.5 text-sm ${
                mode === m ? 'bg-accent text-white' : 'border border-[color:var(--sg-border)] bg-elevated text-text-2'
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <span className="mb-1 block text-xs font-medium text-text-3">Role</span>
              <div className="flex gap-2">
                {['buyer', 'seller'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                      role === r ? 'bg-accent text-white' : 'border border-[color:var(--sg-border)] bg-elevated text-text-2'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
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
          {error && (
            <p className="rounded-md border border-[color:var(--sg-danger)] bg-[color:var(--sg-danger-dim)] px-3 py-2 text-sm text-danger">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="sg-btn sg-btn--primary w-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Working…' : MODE_LABELS[mode]}
          </button>
        </form>
      </div>

      <div className="mt-5 rounded-lg border border-[color:var(--sg-warning)] bg-[color:var(--sg-warning-dim)] p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-warning">Demo credentials</h2>
        <ul className="mt-2 space-y-1.5 text-xs text-warning">
          {DEMO_CREDS.map((c) => (
            <li key={c.email} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{c.role}</span>
              <span className="sg-num font-mono">
                {c.email} / {c.password}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-text-2">Operator console is invite-only in this demo.</p>
      </div>
    </div>
  )
}
