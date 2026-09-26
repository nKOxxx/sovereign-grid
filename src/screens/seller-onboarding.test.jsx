// src/screens/seller-onboarding.test.jsx
// Static-render + design-guard tests for the seller onboarding screen (Wave G2).
// Rendered with react-dom/server renderToStaticMarkup in the node env (no jsdom,
// no new deps) — same approach as operator-console.test.jsx. Asserts:
//   * register/login form for the logged-out buyer,
//   * the create-listing form for an authenticated seller,
//   * custom Select (role=combobox) and ZERO native <select>,
//   * ZERO light-theme Tailwind classes on the dark house design system.
import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { setToken, __resetAuth } from '../lib/auth.js'
import SellerOnboarding from './SellerOnboarding.jsx'

beforeEach(() => {
  __resetAuth()
})

const seller = { role: 'seller', email: 'seller@sg.local', displayName: 'GridCo' }
const buyer = { role: 'buyer', email: 'buyer@x.com', displayName: 'Buyer B' }

const renderOnboarding = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <SellerOnboarding />
    </MemoryRouter>,
  )

const LIGHT_SLOP =
  /bg-white|bg-slate-\d|text-slate-\d|bg-amber-\d|text-amber-\d|bg-emerald-\d|text-emerald-\d|bg-rose-\d|text-rose-\d|border-slate-\d|border-amber-\d|border-emerald-\d|border-rose-\d|border-sky-\d|bg-sky-\d|accent-sky-\d/

describe('SellerOnboarding — auth gate', () => {
  it('shows the register/login form when logged out', () => {
    const html = renderOnboarding()
    expect(html).toContain('Sell compute')
    expect(html).toContain('Create seller account')
    expect(html).toContain('Log in')
  })

  it('shows a warning (not the listing form) for a logged-in buyer', () => {
    setToken('buyer-token', buyer)
    const html = renderOnboarding()
    expect(html).toContain('is a buyer account')
    expect(html).toContain('Only sellers can publish listings')
    expect(html).not.toContain('Create listing')
    expect(html).not.toContain('Publish listing')
  })
})

describe('SellerOnboarding — seller listing form', () => {
  it('renders the create-listing form for a seller with a GPU combobox', () => {
    setToken('seller-token', seller)
    const html = renderOnboarding()
    expect(html).toContain('Create listing')
    expect(html).toContain('Publish listing')
    expect(html).toContain('role="combobox"')
  })
})

describe('SellerOnboarding — design-system guard (world-class-frontend gates)', () => {
  it('renders zero native <select> elements (custom Select only)', () => {
    setToken('seller-token', seller)
    const html = renderOnboarding()
    expect(html.match(/<select\b/g) || []).toHaveLength(0)
    expect(html).toContain('role="combobox"')
  })

  it('renders zero light-theme Tailwind classes on the dark app', () => {
    setToken('seller-token', seller)
    const html = renderOnboarding()
    expect(html.match(LIGHT_SLOP) || []).toHaveLength(0)
  })

  it('figures carry the financial-product tells (sg-num / sg-card / sg-display)', () => {
    setToken('seller-token', seller)
    const html = renderOnboarding()
    expect(html).toContain('sg-num')
    expect(html).toContain('sg-card')
    expect(html).toContain('sg-display')
  })
})
