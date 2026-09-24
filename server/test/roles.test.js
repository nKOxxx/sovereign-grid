// server/test/roles.test.js
// Unit tests for the deny-by-default role guard (baseline #4, #5, #9).
// Pure functions — no HTTP layer needed.

import { describe, it, expect, vi } from 'vitest'
import { requireRole } from '../src/middleware/roles.js'

function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = vi.fn((code) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body) => {
    res.body = body
    return res
  })
  return res
}

describe('requireRole', () => {
  it('returns 401 when there is no user (missing/invalid)', () => {
    const res = mockRes()
    const next = vi.fn()
    requireRole('operator')({}, res, next)
    expect(res.statusCode).toBe(401)
    expect(res.body.error.code).toBe('unauthorized')
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 for a malformed user (no id)', () => {
    const res = mockRes()
    const next = vi.fn()
    requireRole('operator')({ user: { role: 'operator' } }, res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when the role is not allowed', () => {
    const res = mockRes()
    const next = vi.fn()
    requireRole('operator')({ user: { id: '1', role: 'buyer' } }, res, next)
    expect(res.statusCode).toBe(403)
    expect(res.body.error.code).toBe('forbidden')
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next() for the allowed role', () => {
    const res = mockRes()
    const next = vi.fn()
    requireRole('operator')({ user: { id: '1', role: 'operator' } }, res, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.statusCode).toBeNull()
  })

  it('accepts an array of allowed roles', () => {
    const next = vi.fn()
    requireRole(['buyer', 'seller'])({ user: { id: '1', role: 'seller' } }, mockRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('rejects a role not in the allowed array', () => {
    const res = mockRes()
    const next = vi.fn()
    requireRole(['buyer', 'seller'])({ user: { id: '1', role: 'operator' } }, res, next)
    expect(res.statusCode).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('requireRole("any") accepts any authenticated user', () => {
    const next = vi.fn()
    requireRole('any')({ user: { id: '1', role: 'buyer' } }, mockRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('requireRole("any") still demands an authenticated user', () => {
    const res = mockRes()
    requireRole('any')({}, res, vi.fn())
    expect(res.statusCode).toBe(401)
  })
})
