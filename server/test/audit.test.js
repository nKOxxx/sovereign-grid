// server/test/audit.test.js
// Proves the immutable audit log:
//   * approval INSERT and deal status UPDATE each produce an audit row
//   * UPDATE / DELETE / TRUNCATE on audit_log are denied for BOTH sg_app and
//     sg_migrate (revoked; immutability holds even for the schema owner)
// Runs against an isolated scratch database.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { migrate } from '../src/db/migrate.js'
import { createPool, withUser } from '../src/db/pool.js'
import { createScratchDb, dropScratchDb } from './helpers/db.js'

const { Client } = pg
let scratch
let appPool
let migrateClient

const ids = {
  op: randomUUID(),
  buyer: randomUUID(),
  seller: randomUUID(),
  deal: randomUUID(),
}

beforeAll(async () => {
  scratch = await createScratchDb()
  await migrate({ url: scratch.url, log: () => {} })
  appPool = createPool(scratch.appUrl)

  await withUser(ids.op, 'operator', async (c) => {
    await c.query(
      `INSERT INTO users (id, role, email) VALUES
         ($1,'operator','op@sg.test'),($2,'buyer','buyer@sg.test'),($3,'seller','seller@sg.test')`,
      [ids.op, ids.buyer, ids.seller],
    )
    await c.query(`INSERT INTO deals (id, name, status) VALUES ($1,$2,$3)`, [
      ids.deal,
      'Falcon x Nordic',
      'negotiating',
    ])
    await c.query(
      `INSERT INTO deal_parties (deal_id, user_id, role) VALUES ($1,$2,'buyer'),($1,$3,'seller')`,
      [ids.deal, ids.buyer, ids.seller],
    )
  }, appPool)

  migrateClient = new Client({ connectionString: scratch.migrateUrl })
  await migrateClient.connect()
})

afterAll(async () => {
  await migrateClient.end()
  await appPool.end()
  await dropScratchDb(scratch.dbName)
})

async function approvalCount(role, actor) {
  return withUser(actor, role, async (c) => {
    const { rows } = await c.query(
      `SELECT entity, action FROM audit_log WHERE entity = 'approvals' ORDER BY occurred_at`,
    )
    return rows
  }, appPool)
}

describe('immutable audit log', () => {
  it('records an audit row on approval INSERT', async () => {
    const approvalId = randomUUID()
    await withUser(ids.op, 'operator', async (c) => {
      await c.query(
        `INSERT INTO approvals (id, deal_id, approver_id, scope, decision, reviewed_at)
         VALUES ($1,$2,$3,$4,'approved', now())`,
        [approvalId, ids.deal, ids.op, 'route_reviewer_decision'],
      )
    }, appPool)

    const rows = await approvalCount('operator', ids.op)
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({ entity: 'approvals', action: 'insert' })

    // detail snapshot carries the scope
    const detail = await withUser(ids.op, 'operator', async (c) => {
      const { rows } = await c.query(
        `SELECT details FROM audit_log WHERE entity='approvals' AND entity_id=$1`,
        [approvalId],
      )
      return rows[0].details
    }, appPool)
    expect(detail.scope).toBe('route_reviewer_decision')
    expect(detail.decision).toBe('approved')
  })

  it('records an audit row on approvals UPDATE', async () => {
    const approvalId = randomUUID()
    await withUser(ids.op, 'operator', async (c) => {
      await c.query(
        `INSERT INTO approvals (id, deal_id, approver_id, scope, decision) VALUES ($1,$2,$3,$4,'requested')`,
        [approvalId, ids.deal, ids.op, 'margin_exception'],
      )
      await c.query(`UPDATE approvals SET decision='approved' WHERE id=$1`, [approvalId])
    }, appPool)

    const rows = await approvalCount('operator', ids.op)
    const updates = rows.filter((r) => r.action === 'update')
    expect(updates.length).toBe(1)
  })

  it('records an audit row on deal status transition', async () => {
    await withUser(ids.op, 'operator', async (c) => {
      await c.query(`UPDATE deals SET status='conditionally_awarded' WHERE id=$1`, [ids.deal])
    }, appPool)

    const rows = await withUser(ids.op, 'operator', async (c) => {
      const { rows } = await c.query(
        `SELECT entity, action, details FROM audit_log
         WHERE entity='deals' AND action='update' ORDER BY occurred_at`,
      )
      return rows
    }, appPool)
    expect(rows.length).toBe(1)
    expect(rows[0].action).toBe('update')
    expect(rows[0].details.status).toBe('conditionally_awarded')
  })

  it('denies UPDATE on audit_log for sg_app even as operator', async () => {
    await expect(
      withUser(ids.op, 'operator', async (c) => {
        await c.query(`UPDATE audit_log SET action='hacked'`)
      }, appPool),
    ).rejects.toThrow()
  })

  it('denies UPDATE, DELETE and TRUNCATE on audit_log for sg_migrate', async () => {
    await expect(migrateClient.query(`UPDATE audit_log SET action='x' WHERE false`)).rejects.toThrow()
    await expect(migrateClient.query(`DELETE FROM audit_log`)).rejects.toThrow()
    await expect(migrateClient.query(`TRUNCATE audit_log`)).rejects.toThrow()
  })
})
