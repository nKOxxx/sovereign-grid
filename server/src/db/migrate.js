// server/src/db/migrate.js
// Minimal migration runner.
//
//   * Applies .sql files from server/db/migrations in filename order.
//   * Connects as sg_migrate (the schema owner) regardless of the role encoded
//     in DATABASE_URL, so tables/triggers/policies are owned by sg_migrate.
//   * Records each applied file in schema_migrations; re-running is a no-op
//     (already-applied files are skipped), so `npm run migrate` is safe to run
//     repeatedly and the second run does nothing.
//
// CLI:  node src/db/migrate.js
// API:  import { migrate } from './migrate.js'

import pg from 'pg'
import { readdir, readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const { Client } = pg
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations')
const ROLENAME = 'sg_migrate'

// Minimal zero-dependency .env loader (no dotenv dep, per minimal-deps rule).
// Populates DATABASE_URL from server/.env when it isn't already in the process
// environment. Invalid lines are ignored; existing env vars win.
function loadEnvFile() {
  if (process.env.DATABASE_URL) return
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env')
  if (!existsSync(envPath)) return
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const m = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m || m[1] in process.env) continue
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
loadEnvFile()

async function listMigrationFiles() {
  const names = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  return names.map((name) => ({ name, path: path.join(MIGRATIONS_DIR, name) }))
}

/**
 * Resolve the migration connection.
 *
 * Local infra: DATABASE_URL carries no password (socket trust auth) and the
 * schema-owner role is sg_migrate — rewrite the URL to force that role.
 * Managed Postgres (Render/Supabase/Neon/...): the URL carries its own
 * credentials over TLS and must NOT be rewritten (the provisioning user owns
 * the database). There we SET ROLE sg_migrate best-effort after connecting so
 * DDL ownership matches local whenever the role exists.
 */
export function migrationConnectionUrl(url) {
  let hasPassword = false
  try {
    hasPassword = Boolean(new URL(url).password)
  } catch {
    // not a parseable URL — treat as local/socket style
  }
  return hasPassword
    ? url
    : url.replace(/^(\w+:\/\/)([^@/]*@)?/, `$1${ROLENAME}@`)
}

// Earlier revisions/tests may reference the old name.
export const asMigrateUrl = migrationConnectionUrl

/**
 * Run pending migrations against a database.
 * @param {{url?: string, log?: (msg: string)=>void}} [opts]
 * @returns {Promise<{appliedNow: string[], skipped: string[]}>}
 */
export async function migrate({ url = process.env.DATABASE_URL, log = console.log } = {}) {
  if (!url) throw new Error('DATABASE_URL is not set')

  let hasPassword = false
  try {
    hasPassword = Boolean(new URL(url).password)
  } catch {
    // unparseable — local socket style
  }
  const client = new Client({ connectionString: migrationConnectionUrl(url) })
  await client.connect()
  try {
    // Managed URL: best-effort adopt the schema-owner role (no-op when absent).
    if (hasPassword) {
      try {
        await client.query(`SET ROLE ${ROLENAME}`)
        log(`migrations running as ${ROLENAME}`)
      } catch {
        await client.query('RESET ROLE')
        log('migrations running as the DATABASE_URL role (managed database)')
      }
    }
    // Ensure the migration ledger exists (owned by sg_migrate).
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id          serial PRIMARY KEY,
         filename    text NOT NULL UNIQUE,
         applied_at  timestamptz NOT NULL DEFAULT now()
       )`,
    )

    const { rows } = await client.query('SELECT filename FROM schema_migrations')
    const applied = new Set(rows.map((r) => r.filename))

    const files = await listMigrationFiles()
    const appliedNow = []
    const skipped = []

    for (const f of files) {
      if (applied.has(f.name)) {
        skipped.push(f.name)
        continue
      }
      const sql = await readFile(f.path, 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f.name])
        await client.query('COMMIT')
        appliedNow.push(f.name)
        log(`applied  ${f.name}`)
      } catch (err) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* ignore */
        }
        throw new Error(`migration ${f.name} failed: ${err.message}`, { cause: err })
      }
    }
    return { appliedNow, skipped }
  } finally {
    await client.end()
  }
}

// CLI entry point.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  migrate()
    .then(({ appliedNow }) => {
      if (appliedNow.length === 0) console.log('schema up to date; nothing to apply')
      else console.log(`done: applied ${appliedNow.join(', ')}`)
    })
    .catch((err) => {
      console.error(err.message)
      if (process.env.DEBUG) console.error(err.stack)
      process.exitCode = 1
    })
}
