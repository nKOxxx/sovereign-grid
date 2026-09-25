// server/src/app.js
// Express application factory — exported (not listening) so tests can spin it
// up on an ephemeral port with node fetch, and index.js can `listen` in prod.
//
//   createApp({ pool, logger }) -> express app
//
//   * pool defaults to the DATABASE_URL pool (production / index.js); tests
//     inject a pool bound to their scratch database.
//   * Security headers on every response; express.json capped at 256kb
//     (oversized bodies -> 413, see lib/errors.js).
//   * CORS: allow-list from CORS_ORIGINS (defaults to the known frontend
//     hosts). Unknown origins get no CORS headers (see middleware/cors.js).
//   * /health + /api/health: unauthenticated liveness probes, no auth — they
//     are registered BEFORE any auth middleware.
//   * 404 for unknown routes, then the generic error handler (no stack/SQL
//     leak, correlation id on responses).

import express from 'express'
import { defaultPool } from './db/pool.js'
import { createErrorHandler } from './lib/errors.js'
import { securityHeaders } from './middleware/security-headers.js'
import { createCors } from './middleware/cors.js'
import { createAuthRouter } from './routes/auth.js'
import { createRequestsRouter } from './routes/requests.js'
import { createListingsRouter } from './routes/listings.js'
import { createDealsRouter } from './routes/deals.js'
import { createMarketplaceRouter } from './routes/marketplace.js'
import { createCalculatorRouter } from './routes/calculator.js'
import { createFeesRouter } from './routes/fees.js'
import { createEligibilityRouter } from './routes/eligibility.js'

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:4173',
  'http://localhost:5173',
  'https://nkoxxx.github.io',
]

function parseCorsOrigins(env = process.env) {
  const raw = env.CORS_ORIGINS
  if (!raw) return DEFAULT_CORS_ORIGINS
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * @param {{pool?: import('pg').Pool, logger?: object}} [opts]
 */
export function createApp({ pool = defaultPool, logger = console } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true) // honour X-Forwarded-For so req.ip reflects the client

  // Global middleware: headers on everything, CORS before routing, JSON body
  // capped at 256kb (over the cap -> payload_too_large 413).
  app.use(securityHeaders)
  app.use(createCors({ origins: parseCorsOrigins() }))
  app.use(express.json({ limit: '256kb' }))

  // Unauthenticated liveness probes — registered before any auth middleware so
  // load balancers / health checks never need a token.
  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() })
  })
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() })
  })

  app.use('/api/auth', createAuthRouter({ pool }))
  app.use('/api/requests', createRequestsRouter({ pool }))
  app.use('/api/listings', createListingsRouter({ pool }))
  app.use('/api/deals', createDealsRouter({ pool }))

  // Wave C — domain API.
  app.use('/api/marketplace', createMarketplaceRouter({ pool }))
  app.use('/api/calculator', createCalculatorRouter({ pool }))
  app.use('/api/fees', createFeesRouter({ pool }))
  app.use('/api/eligibility', createEligibilityRouter({ pool }))

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
  })

  app.use(createErrorHandler({ logger }))

  return app
}

export { parseCorsOrigins }
