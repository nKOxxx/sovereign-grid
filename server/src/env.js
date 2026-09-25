// server/src/env.js
// Minimal zero-dependency server/.env loader. Populates DATABASE_URL / PORT /
// SESSION_TTL_DAYS from server/.env (gitignored) when not already in the
// process environment. Imported FIRST by index.js: ESM evaluates direct
// dependencies in source order of the import statements, so this runs before
// app.js -> pool.js builds its eager default pool.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env')

if (!process.env.DATABASE_URL && existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}

// WAVE E #4 — required-env validation at boot. Pure function (reads the passed
// env object, defaulting to process.env) so it is directly unit-testable.
// Returns the list of missing variable names; an empty array means OK.
//
//   * DATABASE_URL — or any PG* var (PGHOST/PGPORT/PGUSER/...) as an
//     alternative connection source for node-pg.
//   * PORT — explicit listen port (index.js refuses to guess a random one).
//
// SESSION_TTL_DAYS is intentionally NOT required: sessions.js already defaults
// it to 7, so its absence is safe.
export function validateEnv(env = process.env) {
  const missing = []
  const hasDbConfig = Boolean(env.DATABASE_URL) || Boolean(env.PGHOST)
  if (!hasDbConfig) missing.push('DATABASE_URL (or a PG* variable, e.g. PGHOST)')
  if (!env.PORT) missing.push('PORT')
  return missing
}

