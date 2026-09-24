// server/test/rls.test.js
// Proves the Row-Level Security boundary is the enforcement point (baseline #6):
//   * buyer A sees their own requests only — never buyer B's
//   * an un-authenticated sg_app connection (no app.* context) sees nothing
//   * operator sees everything
//   * seller sees their own listings only
// Runs against an isolated scratch database over the sg_app role.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { migrate } from '../src/db/migrate.js'
import { createPool, withUser } from '../src/db/pool.js'
import { createScratchDb, dropScratchDb } from './helpers/db.js'

let scratch
let appPool
const ids = {
  op: randomUUID(),
  buyerA: randomUUID(),
  buyerB: randomUUID(),
  seller: randomUUID(),
}

beforeAll(async () => {
  scratch = await createScratchDb()
  await migrate({ url: scratch.url, log: () => {} })
  appPool = createPool(scratch.appUrl)

  // Seed as operator (operator policy allows writing rows for any user).
  await withUser(ids.op, 'operator', async (c) => {
    await c.query(
      `INSERT INTO users (id, role, email, display_name) VALUES
         ($1,'operator',$2,'SG Operator'),
         ($3,'buyer',$4,'Buyer A'),
         ($5,'buyer',$6,'Buyer B'),
         ($7,'seller',$8,'Seller S')`,
      [ids.op, 'operator@sg.test', ids.buyerA, 'buyerA@sg.test', ids.buyerB, 'buyerB@sg.test', ids.seller, 'seller@sg.test'],
    )
    await c.query(
      `INSERT INTO requests (id, buyer_id, name) VALUES ($1,$2,$3),($4,$5,$6)`,
      [randomUUID(), ids.buyerA, 'Request A', randomUUID(), ids.buyerB, 'Request B'],
    )
    await c.query(
      `INSERT INTO listings (id, seller_id, name, provider_type, gpu_model, region) VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), ids.seller, 'Listing S', 'NVIDIA', 'H200', 'EU'],
    )
  }, appPool)
})

afterAll(async () => {
  await appPool.end()
  await dropScratchDb(scratch.dbName)
})

describe('RLS tenant isolation (sg_app)', () => {
  it('buyer A sees their own request and NOT buyer B\u2019s', async () => {
    await withUser(ids.buyerA, 'buyer', async (c) => {
      const mine = await c.query('SELECT name FROM requests WHERE buyer_id = $1', [ids.buyerA])
      expect(mine.rows.map((r) => r.name)).toEqual(['Request A'])

      const theirs = await c.query('SELECT id FROM requests WHERE buyer_id = $1', [ids.buyerB])
      expect(theirs.rows).toEqual([])

      const all = await c.query('SELECT id FROM requests')
      expect(all.rows.length).toBe(1) // only own row visible
    }, appPool)
  })

  it('buyer A cannot see seller listings or other users', async () => {
    await withUser(ids.buyerA, 'buyer', async (c) => {
      const listings = await c.query('SELECT id FROM listings')
      expect(listings.rows).toEqual([])
      const users = await c.query('SELECT id FROM users')
      expect(users.rows.length).toBe(1) // only own user row
      expect(users.rows[0].id).toBe(ids.buyerA)
    }, appPool)
  })

  it('sees nothing before a user context is set', async () => {
    const raw = await appPool.connect()
    try {
      // No SET app.user_id / app.user_role on this connection.
      const requests = await raw.query('SELECT id FROM requests')
      const listings = await raw.query('SELECT id FROM listings')
      const users = await raw.query('SELECT id FROM users')
      expect(requests.rows).toEqual([])
      expect(listings.rows).toEqual([])
      expect(users.rows).toEqual([])
    } finally {
      raw.release()
    }
  })

  it('seller sees their own listing and nothing of the buyers', async () => {
    await withUser(ids.seller, 'seller', async (c) => {
      const mine = await c.query('SELECT name FROM listings WHERE seller_id = $1', [ids.seller])
      expect(mine.rows.map((r) => r.name)).toEqual(['Listing S'])
      const requests = await c.query('SELECT id FROM requests')
      expect(requests.rows).toEqual([])
    }, appPool)
  })

  it('operator sees everything', async () => {
    await withUser(ids.op, 'operator', async (c) => {
      const requests = await c.query('SELECT id FROM requests')
      const listings = await c.query('SELECT id FROM listings')
      const users = await c.query('SELECT id FROM users')
      expect(requests.rows.length).toBe(2)
      expect(listings.rows.length).toBe(1)
      expect(users.rows.length).toBe(4)
    }, appPool)
  })
})
