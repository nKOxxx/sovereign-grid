// src/screens/operator-console.test.jsx
// Render-level RBAC tests for the operator console (Wave F). Rendered with
// react-dom/server renderToStaticMarkup in the node env (no jsdom, no new
// deps): we inject an operator vs a buyer session via auth.setToken and assert
// that operator-only controls appear for the operator and NOT for others.
// The offline-fallback demo state is the rendered baseline on the static site.
import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { setToken, __resetAuth } from '../lib/auth.js'
import { MarketProvider } from '../store/MarketContext.jsx'
import FeeEngine from './FeeEngine.jsx'
import Eligibility from './Eligibility.jsx'
import DealRoom from './DealRoom.jsx'

beforeEach(() => {
  __resetAuth()
})

const operator = { role: 'operator', email: 'operator@sg.local', displayName: 'Dana X' }
const buyer = { role: 'buyer', email: 'buyer@x.com', displayName: 'Buyer B' }

describe('FeeEngine — policy panel RBAC', () => {
  it('operator sees the editable policy form (Save control)', () => {
    setToken('op-token', operator)
    const html = renderToStaticMarkup(
      <MarketProvider>
        <FeeEngine />
      </MarketProvider>,
    )
    expect(html).toContain('Save policy')
    expect(html).toContain('operator edit')
    expect(html).toContain('$')
  })

  it('non-operator sees a read-only policy and no Save control', () => {
    setToken('buyer-token', buyer)
    const html = renderToStaticMarkup(
      <MarketProvider>
        <FeeEngine />
      </MarketProvider>,
    )
    expect(html).toContain('read-only')
    expect(html).not.toContain('Save policy')
    // economics still render for everyone
    expect(html).toContain('$')
  })
})

describe('Eligibility — operator case queue RBAC', () => {
  it('operator sees the case queue with Approve/Reject controls and identity', () => {
    setToken('op-token', operator)
    const html = renderToStaticMarkup(<Eligibility />)
    expect(html).toContain('Operator case queue')
    expect(html).toContain('Approve')
    expect(html).toContain('Reject')
    expect(html).toContain('signed in as')
    expect(html).toContain('Dana X')
    // pre-screening states still present (D08)
    expect(html.toLowerCase()).toContain('pre-screened')
  })

  it('buyer/seller see no operator case queue (read-only results)', () => {
    setToken('buyer-token', buyer)
    const html = renderToStaticMarkup(<Eligibility />)
    expect(html).not.toContain('Operator case queue')
    expect(html).not.toContain('Reject')
    // the public decision cards still render
    expect(html.toLowerCase()).toContain('approved by reviewer')
  })
})

describe('DealRoom — operator controls don not crash and stay gated', () => {
  it('renders (connection gate) without throwing for an operator', () => {
    setToken('op-token', operator)
    const html = renderToStaticMarkup(
      <MarketProvider>
        <DealRoom />
      </MarketProvider>,
    )
    // initial state is the connection gate; operator UI must not crash on SSR
    expect(html).toContain('Deal Room')
  })

  it('renders for a logged-out/buyer session without throwing', () => {
    setToken('buyer-token', buyer)
    const html = renderToStaticMarkup(
      <MarketProvider>
        <DealRoom />
      </MarketProvider>,
    )
    expect(html).toContain('Deal Room')
  })
})

describe('FeeEngine — design-system guard (world-class-frontend gates)', () => {
  const LIGHT_SLOP =
    /bg-white|bg-slate-\d|text-slate-\d|bg-amber-\d|text-amber-\d|bg-emerald-\d|text-emerald-\d|bg-rose-\d|text-rose-\d|border-slate-\d|border-amber-\d|border-emerald-\d|border-rose-\d|border-sky-\d|bg-sky-\d|accent-sky-\d/

  const renderFee = (session) => {
    setToken('op-token', session)
    return renderToStaticMarkup(
      <MarketProvider>
        <FeeEngine />
      </MarketProvider>,
    )
  }

  it('renders zero native <select> elements (custom Select only)', () => {
    const html = renderFee(operator)
    expect(html.match(/<select\b/g) || []).toHaveLength(0)
    expect(html).toContain('role="combobox"')
  })

  it('renders zero light-theme Tailwind classes on the dark app', () => {
    const html = renderFee(operator)
    expect(html.match(LIGHT_SLOP) || []).toHaveLength(0)
  })

  it('figures carry the financial-product tells (sg-num / sg-card / sg-display)', () => {
    const html = renderFee(operator)
    expect(html).toContain('sg-num')
    expect(html).toContain('sg-card')
    expect(html).toContain('sg-display')
  })
})
