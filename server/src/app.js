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
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defaultPool } from './db/pool.js'
import { createErrorHandler } from './lib/errors.js'
import { securityHeaders } from './middleware/security-headers.js'
import { createCors } from './middleware/cors.js'
import { createAuthRouter } from './routes/auth.js'
import { createOperatorRouter } from './routes/operator.js'
import { createRequestsRouter } from './routes/requests.js'
import { createListingsRouter } from './routes/listings.js'
import { createDealsRouter } from './routes/deals.js'
import { createMarketplaceRouter } from './routes/marketplace.js'
import { createCalculatorRouter } from './routes/calculator.js'
import { createFeesRouter } from './routes/fees.js'
import { createEligibilityRouter } from './routes/eligibility.js'
import { createIntelRouter } from './routes/intel.js'
import { createRateLimiter } from './middleware/rate-limit.js'

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
export function createApp({ pool = defaultPool, logger = console, fetchImpl = globalThis.fetch } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true) // honour X-Forwarded-For so req.ip reflects the client

  // Global middleware: headers on everything, CORS before routing, JSON body
  // capped at 256kb (over the cap -> payload_too_large 413).
  app.use(securityHeaders)
  app.use(createCors({ origins: parseCorsOrigins() }))
  app.use(express.json({ limit: '256kb' }))

  // Moderate write throttle (60/min/IP, dependency-free, in-memory) across every
  // /api write. The auth router applies its own STRICTER per-endpoint 10/15min
  // buckets on top for login/register/resend/reset-request.
  const writeLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 })
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT' || req.method === 'DELETE') {
      return writeLimiter.middleware(req, res, next)
    }
    next()
  })
  // Test hook (mirrors the auth-rate-limiter reset below): lets a suite give
  // itself a fresh per-test write budget. No-op in production.
  app.locals.resetWriteRateLimiter = () => writeLimiter.reset()

  // Unauthenticated liveness probes — registered before any auth middleware so
  // load balancers / health checks never need a token.
  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() })
  })
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() })
  })

  const authRouter = createAuthRouter({ pool })
  // Test harness / restart hook: clear the strict auth buckets without needing a
  // fresh app instance. No-op in production.
  if (typeof authRouter.resetRateLimiters === 'function') {
    app.locals.resetAuthRateLimiters = () => authRouter.resetRateLimiters()
  }
  app.use('/api/auth', authRouter)
  app.use('/api/operator', createOperatorRouter({ pool }))
  app.use('/api/requests', createRequestsRouter({ pool }))
  app.use('/api/listings', createListingsRouter({ pool }))
  app.use('/api/deals', createDealsRouter({ pool }))

  // Wave C — domain API.
  app.use('/api/marketplace', createMarketplaceRouter({ pool }))
  app.use('/api/calculator', createCalculatorRouter({ pool }))
  app.use('/api/fees', createFeesRouter({ pool }))
  app.use('/api/eligibility', createEligibilityRouter({ pool }))

  // Wave L — market-intel observations backend (public read + operator ingest).
  app.use('/api/intel', createIntelRouter({ pool, fetchImpl }))

  // Single-process deploy: when SG_STATIC_DIR points at the built frontend
  // (repo `dist/`), the API also serves it — same-origin /api, no CORS puzzle.
  // Opt-in: unset (or dir missing) leaves API-only behavior byte-identical for
  // dev/test/CI and Pages. API routes keep JSON 404s; anything not under /api
  // falls back to index.html (SPA client routing).
  const staticDir = process.env.SG_STATIC_DIR
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      res.sendFile(join(staticDir, 'index.html'))
    })
  }

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
  })

  app.use(createErrorHandler({ logger }))

  return app
}

export { parseCorsOrigins }
