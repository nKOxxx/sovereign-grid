// server/test/helpers/db.js
// Scratch-database lifecycle for the security test suite.
//
// An admin connection (the local OS superuser, `ares`) creates and drops an
// isolated database per test file:  sg_test_<random>. The migration runs as
// sg_migrate inside it; RLS tests run as sg_app. Databases are dropped after
// each suite (DROP ... WITH (FORCE) clears lingering connections).

import pg from 'pg'
import { randomUUID } from 'node:crypto'

const { Client } = pg

const ADMIN_URL = process.env.SG_TEST_ADMIN_URL || 'postgresql:///postgres?host=/tmp'
const HOST = '/tmp'

export const baseUrl = (db) => `postgresql:///${db}?host=${HOST}`
export const appUrl = (db) => `postgresql://sg_app@/${db}?host=${HOST}`
export const migrateUrl = (db) => `postgresql://sg_migrate@/${db}?host=${HOST}`

/**
 * Create a scratch database ready for the migration: citext pre-installed and
 * schema access granted to the two app roles.
 */
export async function createScratchDb() {
  const dbName = `sg_test_${randomUUID().replace(/-/g, '').slice(0, 16)}`

  const admin = new Client({ connectionString: ADMIN_URL })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`)
  } finally {
    await admin.end()
  }

  const prep = new Client({ connectionString: baseUrl(dbName) })
  await prep.connect()
  try {
    await prep.query('CREATE EXTENSION IF NOT EXISTS citext')
    await prep.query('GRANT CREATE, USAGE ON SCHEMA public TO sg_migrate')
    await prep.query('GRANT USAGE ON SCHEMA public TO sg_app')
    await prep.query(`GRANT CONNECT ON DATABASE "${dbName}" TO sg_app, sg_migrate`)
  } finally {
    await prep.end()
  }

  return { dbName, url: baseUrl(dbName), appUrl: appUrl(dbName), migrateUrl: migrateUrl(dbName) }
}

export async function dropScratchDb(dbName) {
  const admin = new Client({ connectionString: ADMIN_URL })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}
