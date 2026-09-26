// src/screens/legal.test.jsx — Wave M public legal pages + verify-banner UI.
//
// Static-render tests (node env, react-dom/server, same harness as
// deal-accept.test.jsx). Asserts:
//   * /terms renders the indicative-pricing disclaimer (house law: never a live
//     market price), the no-escrow / bilateral-deal notice, the data-stored
//     summary, and the placeholder contact email,
//   * /privacy renders what data is stored and the same contact,
//   * an unverified signed-in user sees the dismissible verify banner with a
//     resend button; a verified (or logged-out) user does not,
//   * the LIGHT_SLOP guard: ZERO light-theme Tailwind classes and zero native
//     <select> across the new screens.
import { describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Terms from './Terms.jsx'
import Privacy from './Privacy.jsx'
import Login from './Login.jsx'
import { setToken, __resetAuth } from '../lib/auth.js'

beforeEach(() => {
  __resetAuth()
})

const wrap = (el) => <MemoryRouter>{el}</MemoryRouter>

const LIGHT_SLOP =
  /bg-white|bg-slate-\d|text-slate-\d|border-slate-\d|bg-amber-\d|text-amber-\d|bg-emerald-\d|text-emerald-\d|bg-rose-\d|text-rose-\d|border-slate-\d|border-amber-\d|border-emerald-\d|border-rose-\d|border-sky-\d|bg-sky-\d|accent-sky-\d/

describe('Terms of Service', () => {
  it('renders indicative- vs transacted-pricing disclaimer (never a live market price)', () => {
    const html = renderToStaticMarkup(wrap(<Terms />))
    expect(html).toContain('never a live,')
    expect(html).toContain('market price')
    expect(html).toContain('indicative')
  })

  it('states deals are bilateral and the platform is not a party / no escrow', () => {
    const html = renderToStaticMarkup(wrap(<Terms />))
    expect(html).toContain('not a party to any deal')
    expect(html).toContain('No escrow')
    expect(html).toContain('bilateral')
  })

  it('lists account responsibilities and the placeholder contact', () => {
    const html = renderToStaticMarkup(wrap(<Terms />))
    expect(html).toContain('responsible')
    expect(html).toContain('contact@sovereign-grid.example')
  })

  it('has no light-theme classes and no native <select>', () => {
    const body = renderToStaticMarkup(wrap(<Terms />))
    expect(body.match(LIGHT_SLOP)).toBeNull()
    expect(body.match(/<select\b/)).toBeNull()
  })
})

describe('Privacy Policy', () => {
  it('describes the data stored (email, listings, observations) and what is not', () => {
    const html = renderToStaticMarkup(wrap(<Privacy />))
    expect(html).toContain('email')
    expect(html).toContain('listings')
    expect(html).toContain('Observations')
    expect(html).toContain('do not sell')
  })

  it('includes the placeholder contact and no light-theme classes', () => {
    const html = renderToStaticMarkup(wrap(<Privacy />))
    expect(html).toContain('contact@sovereign-grid.example')
    expect(html.match(LIGHT_SLOP)).toBeNull()
    expect(html.match(/<select\b/)).toBeNull()
  })
})

describe('Login — email-verification banner (Wave M)', () => {
  it('shows a dismissible verify banner with resend for an unverified signed-in user', () => {
    setToken('unverified-token', { email: 'new@sg.local', role: 'buyer', emailVerified: false })
    const html = renderToStaticMarkup(wrap(<Login />))
    expect(html).toContain('Verify your email')
    expect(html).toContain('Resend verification email')
    expect(html).toContain('Dismiss')
  })

  it('hides the verify banner for a verified signed-in user', () => {
    setToken('verified-token', { email: 'ok@sg.local', role: 'buyer', emailVerified: true })
    const html = renderToStaticMarkup(wrap(<Login />))
    expect(html).not.toContain('Resend verification email')
  })

  it('hides the verify banner when logged out', () => {
    const html = renderToStaticMarkup(wrap(<Login />))
    expect(html).not.toContain('Resend verification email')
    expect(html).toContain('Sign in to Sovereign Grid')
  })

  it('links to Terms and Privacy from the footer when signed out', () => {
    const html = renderToStaticMarkup(wrap(<Login />))
    expect(html).toContain('href="/terms"')
    expect(html).toContain('href="/privacy"')
  })
})
