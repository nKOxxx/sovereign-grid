// server/src/index.js
// HTTP entrypoint: build the app and listen on PORT (default 8787).
//
// server/.env is gitignored and supplies DATABASE_URL / PORT / SESSION_TTL_DAYS
// for manual runs. It is loaded by ./env.js, which must be imported BEFORE
// app.js so the default DB pool (built eagerly in pool.js) sees DATABASE_URL.
//
// WAVE E #4: missing required env (DB config / PORT) is a fatal boot error with
// a clear message listing exactly what is absent — never a half-configured
// server starting anyway. validateEnv() only gates boot here; createApp() stays
// env-agnostic so tests construct the app directly without touching this file.

import './env.js'
import { validateEnv } from './env.js'
import { createApp } from './app.js'

const missing = validateEnv()
if (missing.length) {
  console.error(
    `[env] FATAL: missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
  )
  process.exit(1)
}

const PORT = Number(process.env.PORT || 8787)
const app = createApp()

app.listen(PORT, () => {
  console.log(`sovereign-grid server listening on ${PORT}`)
})
