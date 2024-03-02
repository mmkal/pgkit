import {createClient, sql} from '@pgkit/client'
import * as path from 'path'
import {beforeEach, vi as jest} from 'vitest'

/**
 * Gets a pool suitable for use in tests. Creates a schema based on the passed-in test file name,
 * which is wiped before every test. Adds an afterAll listener which makes sure jest exits cleanly.
 */
export const getPoolHelper = (params: {__filename: string}) => {
  const dbName = path.parse(params.__filename).name.replaceAll(/\W/g, '_')
  return getPoolHelper2(dbName)
}

const connectionString = (db: string) => `postgresql://postgres:postgres@localhost:5432/${db}`
const admin = createClient(connectionString('postgres'))

export const getPoolHelper2 = (dbName: string, {lockTimeout = '', statementTimeout = '4s'} = {}) => {
  const schemaName = 'public'
  const schemaIdentifier = sql.identifier([schemaName])

  const pool = createClient(connectionString(dbName), {
    pgpOptions: {
      // schema: schemaName,
      noWarnings: true,
      connect: async ({client, useCount}) => {
        if (useCount === 0) {
          if (statementTimeout) await client.query(`set statement_timeout to '${statementTimeout}'`)
          if (lockTimeout) await client.query(`set lock_timeout = '${lockTimeout}'`)
        }
      },
    },
    // idleTimeout: 1,
  })

  // // https://github.com/gajus/slonik/issues/63#issuecomment-500889445
  // afterAll(async () => new Promise(r => setTimeout(r, 1)))

  beforeEach(async () => {
    const exists = Boolean(await admin.maybeOne(sql`select 1 from pg_database where datname = ${dbName}`))
    if (!exists) {
      await admin.query(sql`create database ${sql.identifier([dbName])}`)
    }

    await pool.query(sql`drop schema if exists ${schemaIdentifier} cascade`)
    await pool.query(sql`create schema ${schemaIdentifier}`)
  })

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  /** Get the names from a list of migrations. Useful for light assertions */
  const names = (migrations: Array<{name: string}>) => migrations.map(m => m.name)

  return {
    pool,
    dbName,
    id: dbName,
    schemaName,
    schemaIdentifier,
    mockLogger,
    names,
    sql,
  }
}
