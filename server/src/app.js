// server/src/app.js
// Express application factory — exported (not listening) so tests can spin it
// up on an ephemeral port with node fetch, and index.js can `listen` in prod.
//
//   createApp({ pool, logger }) -> express app
//
//   * pool defaults to the DATABASE_URL pool (production / index.js); tests
//     inject a pool bound to their scratch database.
//   * Security headers on every response; express.json capped at 100kb.
//   * CORS: intentionally NOT configured — the frontend is same-origin (Vite
//     dev proxy) at Phase 1, so the API refuses cross-origin preflight by
//     default. See middleware/security-headers.js.
//   * 404 for unknown routes, then the generic error handler (no stack/SQL
//     leak, correlation id on responses).

import express from 'express'
import { defaultPool } from './db/pool.js'
import { createErrorHandler } from './lib/errors.js'
import { securityHeaders } from './middleware/security-headers.js'
import { createAuthRouter } from './routes/auth.js'
import { createRequestsRouter } from './routes/requests.js'
import { createListingsRouter } from './routes/listings.js'
import { createDealsRouter } from './routes/deals.js'

/**
 * @param {{pool?: import('pg').Pool, logger?: object}} [opts]
 */
export function createApp({ pool = defaultPool, logger = console } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true) // honour X-Forwarded-For so req.ip reflects the client

  app.use(securityHeaders)
  app.use(express.json({ limit: '100kb' }))

  app.use('/api/auth', createAuthRouter({ pool }))
  app.use('/api/requests', createRequestsRouter({ pool }))
  app.use('/api/listings', createListingsRouter({ pool }))
  app.use('/api/deals', createDealsRouter({ pool }))

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } })
  })

  app.use(createErrorHandler({ logger }))

  return app
}
