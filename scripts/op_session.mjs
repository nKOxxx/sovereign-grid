#!/usr/bin/env node
// scripts/op_session.mjs — mint an operator session for ops/e2e cleanup.
// Usage: set DATABASE_URL, then: node scripts/op_session.mjs
// Prints the token ONCE (only its SHA-256 hash is stored server-side).
// Never commit or echo this token in logs or CI.
import { createSession } from '../server/src/auth/sessions.js'
import { defaultPool as pool } from '../server/src/db/pool.js'

const { rows } = await pool.query(
  "SELECT id FROM users WHERE role = 'operator' ORDER BY created_at LIMIT 1",
)
if (!rows.length) {
  console.error('no operator user found')
  process.exit(1)
}
const { token, expiresAt } = await createSession(rows[0].id, 'operator')
console.log(token)
await pool.end()
