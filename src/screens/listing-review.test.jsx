// src/screens/listing-review.test.jsx
// Render-level RBAC + design-guard tests for the operator listing review gate
// (Wave G3). Rendered with react-dom/server renderToStaticMarkup in the node
// env (no jsdom, no new deps) — same approach as operator-console.test.jsx and
// seller-onboarding.test.jsx. Asserts:
//   * operator sees the review queue scaffold (heading + column headers),
//   * buyer/seller see an access-denied gate (no queue, no Reject),
//   * ReviewRow renders Approve/Reject + status pill + sg-num price,
//   * ZERO native <select>, ZERO light-theme Tailwind classes.
import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { setToken, __resetAuth } from '../lib/auth.js'
import ListingReview, { ReviewRow } from './ListingReview.jsx'

beforeEach(() => {
  __resetAuth()
})

const operator = { role: 'operator', email: 'operator@sg.local', displayName: 'Dana X' }
const buyer = { role: 'buyer', email: 'buyer@x.com', displayName: 'Buyer B' }
const seller = { role: 'seller', email: 'seller@y.com', displayName: 'Seller Y' }

const renderScreen = (session) => {
  if (session) setToken('tok', session)
  return renderToStaticMarkup(
    <MemoryRouter>
      <ListingReview />
    </MemoryRouter>,
  )
}

const LIGHT_SLOP =
  /bg-white|bg-slate-\d|text-slate-\d|bg-amber-\d|text-amber-\d|bg-emerald-\d|text-emerald-\d|bg-rose-\d|text-rose-\d|border-slate-\d|border-amber-\d|border-emerald-\d|border-rose-\d|border-sky-\d|bg-sky-\d|accent-sky-\d/

describe('ListingReview — RBAC gate', () => {
  it('shows the review scaffold for an operator', () => {
    const html = renderScreen(operator)
    expect(html).toContain('Listing review')
    expect(html).toContain('Listing')
    expect(html).toContain('Region')
    expect(html).toContain('GPU')
    expect(html).toContain('Price')
    expect(html).toContain('Status')
    expect(html).toContain('Action')
    expect(html).toContain('Signed in as')
    expect(html).toContain('Dana X')
  })

  it('denies a buyer and a seller (no queue, no action buttons)', () => {
    for (const s of [buyer, seller]) {
      const html = renderScreen(s)
      expect(html).toContain('restricted to')
      expect(html).not.toContain('Approve')
      expect(html).not.toContain('Reject')
    }
  })
})

describe('ListingReview — ReviewRow', () => {
  const listing = {
    id: 'l1',
    name: 'Nordic H200 — Helsinki primary',
    region: 'EU',
    gpu_model: 'H200 SXM',
    on_demand_price: 3.1,
    committed_price: 2.15,
  }

  it('renders name, region, GPU, sg-num price, status pill and Approve/Reject', () => {
    const html = renderToStaticMarkup(
      <ReviewRow listing={listing} onDecide={() => {}} busy={false} />,
    )
    expect(html).toContain(listing.name)
    expect(html).toContain('EU')
    expect(html).toContain('H200 SXM')
    expect(html).toContain('sg-num')
    expect(html).toContain('$3.10') // on_demand_price, tabular figures
    expect(html).toContain('pending')
    expect(html).toContain('>Approve<')
    expect(html).toContain('>Reject<')
  })

  it('renders zero native <select> and zero light-theme Tailwind classes', () => {
    const html = renderToStaticMarkup(
      <ReviewRow listing={listing} onDecide={() => {}} busy={false} />,
    )
    expect(html.match(/<select\b/g) || []).toHaveLength(0)
    expect(html.match(LIGHT_SLOP) || []).toHaveLength(0)
  })
})

describe('ListingReview — design-system guard (world-class-frontend gates)', () => {
  it('operator view renders zero native <select> elements', () => {
    const html = renderScreen(operator)
    expect(html.match(/<select\b/g) || []).toHaveLength(0)
  })

  it('operator view renders zero light-theme Tailwind classes on the dark app', () => {
    const html = renderScreen(operator)
    expect(html.match(LIGHT_SLOP) || []).toHaveLength(0)
  })

  it('operator view carries the dark house tells (sg-card / sg-display)', () => {
    const html = renderScreen(operator)
    expect(html).toContain('sg-card')
    expect(html).toContain('sg-display')
  })
})
