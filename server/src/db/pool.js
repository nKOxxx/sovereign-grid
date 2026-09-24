// server/src/db/pool.js
// pg connection pool + an RLS-scoped transaction helper.
//
// The runtime pool connects with whatever role DATABASE_URL resolves to. In
// the prepared infra that is sg_app (least privilege, no BYPASSRLS) — e.g.
//   DATABASE_URL=postgresql://sg_app@/sovereign_grid?host=/tmp
//
// withUser(userId, role, fn) opens a transaction, sets the per-transaction
// RLS context GUCs (app.user_id / app.user_role), runs fn(client), and commits.
// RLS policies read those GUCs, so every query inside fn is scoped to the
// acting user. The GUCs are transaction-local (set_config 3rd arg = true), so
// they never leak outside the transaction.

import pg from 'pg'
import { z } from 'zod'

const { Pool, types } = pg

// node-pg returns numeric columns as strings; map them to JS numbers so the API
// (prices, quantities) serializes cleanly as JSON numbers, not "2.5" strings.
// numeric OID = 1700. NULL stays NULL.
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)))

const userContextSchema = z.object({
  userId: z.string().uuid('userId must be a valid uuid'),
  role: z.enum(['buyer', 'seller', 'operator']),
})

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  return new Pool({ connectionString })
}

// Module-level default pool bound to DATABASE_URL.
const defaultPool = createPool()

/**
 * Run `fn(client)` inside a transaction with the RLS user context applied.
 *
 * @param {string} userId - acting user's uuid
 * @param {'buyer'|'seller'|'operator'} role - acting user's role
 * @param {(client: pg.PoolClient) => Promise<T>|T} fn
 * @param {pg.Pool} [pool] - override pool (used by tests against scratch DBs)
 * @returns {Promise<T>} the return value of fn
 */
export async function withUser(userId, role, fn, pool = defaultPool) {
  const ctx = userContextSchema.parse({ userId, role })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)",
      [ctx.userId, ctx.role],
    )
    try {
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // ignore rollback failure; original error is the one to surface
      }
      throw err
    }
  } finally {
    client.release()
  }
}

export { defaultPool }
export default defaultPool
