// server/src/boot.js
// Production boot entry for single-process PaaS deploys (Fly/Render/Docker).
//
//   SG_BOOT_MIGRATE=1 node server/src/boot.js
//
// Sequence: validate env -> migrate schema -> idempotent seed (ON CONFLICT DO
// NOTHING, so golden numbers 93/90/87 exist on any fresh DB and re-runs are
// no-ops) -> listen via the same createApp used by index.js (SG_STATIC_DIR for
// SPA serving). Opt-in via SG_BOOT_MIGRATE so local `node src/index.js` keeps
// its exact current behavior.
//
// Import order discipline (see db/seed.js): src/env.js must be imported before
// the pool module constructs its default Pool.
import '../src/env.js'
import { validateEnv } from './env.js'
import { migrate } from './db/migrate.js'
import { createPool } from './db/pool.js'
import { seed } from '../db/seed.js'
import { createApp } from './app.js'

const missing = validateEnv()
if (missing.length > 0) {
  for (const name of missing) console.error(`[env] FATAL: missing required environment variable: ${name}`)
  process.exit(1)
}

if (process.env.SG_BOOT_MIGRATE === '1') {
  console.log('[boot] running migrations')
  await migrate()
  console.log('[boot] seeding (idempotent)')
  // seed() ends the pool it is given (documented contract — see db/seed.js),
  // so it gets its own dedicated pool, never the serving defaultPool.
  await seed(createPool())
  console.log('[boot] schema + seed ready')
}

const PORT = process.env.PORT
const app = createApp()
app.listen(PORT, () => {
  console.log(`sovereign-grid boot listening on ${PORT}`)
})
