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
