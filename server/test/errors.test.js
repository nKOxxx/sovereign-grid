// server/test/errors.test.js
// Unit tests for the generic error handler (baseline #12): the client never
// sees a stack trace or SQL; they get { error: { code, message }, correlationId }
// and the full detail is logged server-side.

import { describe, it, expect, vi } from 'vitest'
import { ZodError } from 'zod'
import { createErrorHandler } from '../src/lib/errors.js'

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

describe('error handler', () => {
  it('returns a generic 500 body with correlationId and no stack leak', () => {
    const res = mockRes()
    const log = { error: vi.fn() }
    const boom = new Error('kaboom internal secret')
    boom.stack = 'Error: kaboom internal secret\n    at /app/src/db/pool.js:42:11'

    createErrorHandler({ logger: log })(boom, {}, res, vi.fn())

    expect(res.statusCode).toBe(500)
    expect(res.body.error.message).toBe('Internal server error')
    expect(res.body.error.code).toBe('internal_error')
    expect(typeof res.body.correlationId).toBe('string')
    expect(res.body.correlationId.length).toBeGreaterThan(0)

    const bodyJson = JSON.stringify(res.body)
    expect(bodyJson).not.toContain('kaboom')
    expect(bodyJson).not.toContain('pool.js')
    expect(bodyJson).not.toContain('at /app')

    // full detail (incl stack) went to the server log only
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(log.error.mock.calls[0][0].stack).toContain('pool.js')
  })

  it('maps ZodError to a 400 with validation details, never the raw path internals', () => {
    const res = mockRes()
    const err = new ZodError([
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['userId'] },
    ])
    createErrorHandler({ logger: { error: vi.fn() } })(err, {}, res, vi.fn())
    expect(res.statusCode).toBe(400)
    expect(res.body.error.code).toBe('validation_failed')
    expect(res.body.error.message).toBe('Validation failed')
    expect(res.body.error.details).toEqual([{ field: 'userId', message: 'Invalid input (invalid_type)' }])
  })

  it('never echoes SQL-looking database errors to the client', () => {
    const res = mockRes()
    const sqlErr = new Error('relation "users" does not exist')
    sqlErr.code = '42P01'
    createErrorHandler({ logger: { error: vi.fn() } })(sqlErr, {}, res, vi.fn())
    const bodyJson = JSON.stringify(res.body)
    expect(bodyJson).not.toContain('users')
    expect(bodyJson).not.toContain('42P01')
    expect(res.body.error.code).toBe('query_failed')
    expect(res.statusCode).toBe(400)
  })
})
