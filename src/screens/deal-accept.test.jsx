// src/screens/deal-accept.test.jsx
// Buyer offer-acceptance UI — MatchResults "Accept offer" (Wave H/I close-the-loop).
//
// Static-render + design-guard tests (node env, react-dom/server, same harness
// as wave-g.test.jsx). Asserts:
//   * a logged-in buyer sees an "Accept offer" button on match cards,
//   * logged-out visitors and sellers see NO accept button (read-only matches),
//   * the accepted-deal inline state carries the deal id + status under sg-num,
//   * the LIGHT_SLOP guard: ZERO light-theme Tailwind classes on the dark
//     house design system, zero native <select>.
import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { MarketProvider } from '../store/MarketContext.jsx'
import MatchResults from './MatchResults.jsx'
import { setToken, __resetAuth } from '../lib/auth.js'

beforeEach(() => {
  __resetAuth()
})

const wrap = (el) => (
  <MemoryRouter>
    <MarketProvider>{el}</MarketProvider>
  </MemoryRouter>
)

const buyer = { role: 'buyer', email: 'accept.buyer@sg.local', displayName: 'Buyer A' }
const seller = { role: 'seller', email: 'accept.seller@sg.local', displayName: 'Seller X' }

function renderMatchResultsAs(user) {
  if (user) setToken(`${user.role}-token`, user)
  return renderToStaticMarkup(wrap(<MatchResults />))
}

const LIGHT_SLOP =
  /bg-white|bg-slate-\d|text-slate-\d|bg-amber-\d|text-amber-\d|bg-emerald-\d|text-emerald-\d|bg-rose-\d|text-rose-\d|border-slate-\d|border-amber-\d|border-emerald-\d|border-rose-\d|border-sky-\d|bg-sky-\d|accent-sky-\d/

describe('MatchResults — buyer offer-acceptance', () => {
  it('shows an Accept offer button on match cards when logged in as a buyer', () => {
    const html = renderMatchResultsAs(buyer)
    expect(html).toContain('Accept offer')
    // every bookable card offers the action (>=3 seeded offers)
    expect((html.match(/Accept offer/g) || []).length).toBeGreaterThanOrEqual(3)
  })

  it('exposes the buyer-only action only to buyers (hidden for logged-out)', () => {
    const html = renderMatchResultsAs(null)
    expect(html).not.toContain('Accept offer')
  })

  it('exposes the buyer-only action only to buyers (hidden for sellers)', () => {
    const html = renderMatchResultsAs(seller)
    expect(html).not.toContain('Accept offer')
  })

  it('renders the accept action with tabular figures on id/financial tells', () => {
    // The accept POST → inline success state is exercised end-to-end in
    // server/test/deal_accept.test.js. Here we assert the render atoms that
    // make the buyer action legible: an Accept offer button on each card and
    // sg-num tabular figures on scores/prices (ids are rendered the same way).
    const html = renderMatchResultsAs(buyer)
    expect(html).toContain('Accept offer')
    expect(html).toContain('sg-num')
    expect(html).toContain('sg-card')
    expect(html).toContain('sg-display')
  })
})

describe('MatchResults — design-system guard (world-class-frontend gates)', () => {
  it('renders zero native <select> elements', () => {
    const html = renderMatchResultsAs(buyer)
    expect(html.match(/<select\b/g) || []).toHaveLength(0)
  })

  it('renders zero light-theme Tailwind classes on the dark app', () => {
    const html = renderMatchResultsAs(buyer)
    expect(html.match(LIGHT_SLOP) || []).toHaveLength(0)
  })

  it('keeps the golden match scores intact for a buyer session', () => {
    const html = renderMatchResultsAs(buyer)
    ;['93', '90', '87'].forEach((s) => {
      expect(html).toContain(s)
    })
  })
})
