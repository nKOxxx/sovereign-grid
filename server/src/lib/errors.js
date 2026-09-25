// server/src/lib/errors.js
// Generic Express error handler (SECURITY_BASELINE.md #12): client never sees a
// stack trace or SQL; they get { error: { code, message }, correlationId } and
// the full detail is logged server-side with the same correlationId.
//
// Aware of a small set of well-known error shapes so callers can opt specific
// errors out of the generic message (e.g. zod validation -> 400 with why).
// Anything unrecognized -> 500 with a generic message.

import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'

const KNOWN_CODES = {
  UNAUTHORIZED: { status: 401, code: 'unauthorized' },
  FORBIDDEN: { status: 403, code: 'forbidden' },
  NOT_FOUND: { status: 404, code: 'not_found' },
  VALIDATION: { status: 400, code: 'validation_failed' },
  CONFLICT: { status: 409, code: 'conflict' },
}

/**
 * Create the 4-arg error-handling middleware (Express calls it last, after the
 * regular routes).
 * @param {{logger?: {error: Function}}} [opts]
 * @returns {(err, req, res, next) => void}
 */
export function createErrorHandler({ logger = console } = {}) {
  return function errorHandler(err, _req, res, _next) {
    const correlationId = randomUUID()

    let status = 500
    let code = 'internal_error'
    let message = 'Internal server error'
    let exposeDetail

    if (err instanceof ZodError) {
      status = 400
      code = 'validation_failed'
      message = 'Validation failed'
      exposeDetail = err.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message || `Invalid input (${i.code})`,
      }))
    } else if (err && typeof err === 'object' && err.code && KNOWN_CODES[err.code]) {
      const k = KNOWN_CODES[err.code]
      status = k.status
      code = k.code
      message = err.message || 'Request failed'
    } else if (err && typeof err === 'object' && err.expose && err.clientMessage) {
      // Caller explicitly opted a trusted, safe message in.
      status = err.statusCode || 400
      code = err.code || 'request_failed'
      message = err.clientMessage
    } else if (err && (err.status === 413 || err.type === 'entity.too.large')) {
      // express.json body-limit overflow (WAVE E #5): oversized request body.
      status = 413
      code = 'payload_too_large'
      message = 'Request body too large'
    }

    // Scan for SQL error markers: if any, we must not echo the DB message to
    // the client (defense-in-depth over never-leaking).
    const looksLikeSql = /(?:postgres|pg_hba|syntax error|column|relation|duplicate key)/i.test(
      String((err && (err.message || err.detail || '')) || ''),
    )
    if (looksLikeSql) {
      status = 400
      code = 'query_failed'
      message = 'Invalid request'
    }

    // Always log the real detail server-side.
    logger.error({
      correlationId,
      status,
      code,
      message: (err && err.message) || 'unknown',
      stack: (err && err.stack) || undefined,
    })

    const body = {
      error: { code, message },
      correlationId,
    }
    if (exposeDetail) body.error.details = exposeDetail

    if (res && typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(status).json(body)
      return
    }
    // Fallback for bare (non-http) invocation in tests: return the payload.
    return { status, body }
  }
}
