// server/test/migrate.test.js
// Proves the migration runner: applies cleanly once, records in
// schema_migrations, and is a no-op on the second run (idempotent) — all
// against an isolated scratch database.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { migrate } from '../src/db/migrate.js'
import { createScratchDb, dropScratchDb, baseUrl } from './helpers/db.js'

const { Client } = pg
let scratch

beforeAll(async () => {
  scratch = await createScratchDb()
})

afterAll(async () => {
  await dropScratchDb(scratch.dbName)
})

describe('migrate', () => {
  it('applies 0001 once and is a no-op on the second run', async () => {
    const first = await migrate({ url: scratch.url, log: () => {} })
    expect(first.appliedNow.length).toBeGreaterThan(0)
    expect(first.appliedNow).toContain('0001_init.sql')

    const second = await migrate({ url: scratch.url, log: () => {} })
    expect(second.appliedNow).toEqual([])
    expect(second.skipped).toContain('0001_init.sql')
  })

  it('records exactly one schema_migrations row', async () => {
    const c = new Client({ connectionString: baseUrl(scratch.dbName) })
    await c.connect()
    try {
      const { rows } = await c.query('SELECT filename FROM schema_migrations')
      expect(rows.map((r) => r.filename)).toEqual([
        '0001_init.sql', '0002_auth.sql', '0003_wave_c.sql',
        '0004_wave_c_fix.sql', '0005_listing_review.sql',
      ])
    } finally {
      await c.end()
    }
  })

  it('created all expected tables', async () => {
    const c = new Client({ connectionString: baseUrl(scratch.dbName) })
    await c.connect()
    try {
      const { rows } = await c.query(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename IN ('users','requests','listings','deals','deal_parties',
                             'offers','evidence_items','approvals','messages','audit_log')
         ORDER BY tablename`,
      )
      expect(rows.map((r) => r.tablename)).toEqual([
        'approvals', 'audit_log', 'deal_parties', 'deals', 'evidence_items',
        'listings', 'messages', 'offers', 'requests', 'users',
      ])
    } finally {
      await c.end()
    }
  })

  it('enabled RLS on every table', async () => {
    const c = new Client({ connectionString: baseUrl(scratch.dbName) })
    await c.connect()
    try {
      const { rows } = await c.query(
        `SELECT relname FROM pg_class
         WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace
           AND relrowsecurity = true
         ORDER BY relname`,
      )
      expect(rows.map((r) => r.relname)).toEqual([
        'approvals', 'audit_log', 'deal_parties', 'deals', 'eligibility_cases',
        'evidence_items', 'fee_policy', 'listings', 'messages', 'offers',
        'requests', 'sessions', 'users',
      ])
    } finally {
      await c.end()
    }
  })

  it('creates every table owned by sg_migrate (schema owner)', async () => {
    // Regression guard: the migration must run as sg_migrate so it owns the
    // schema objects and the audit immutability revoke-from-owner actually
    // binds. If a previous run created tables as e.g. the OS superuser, this
    // assertion fails.
    const c = new Client({ connectionString: baseUrl(scratch.dbName) })
    await c.connect()
    try {
      const { rows } = await c.query(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename IN ('users','requests','listings','deals','deal_parties',
                             'offers','evidence_items','approvals','messages','audit_log')
           AND tableowner <> 'sg_migrate'`,
      )
      expect(rows).toEqual([])
    } finally {
      await c.end()
    }
  })
})
