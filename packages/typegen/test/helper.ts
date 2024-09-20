import {ClientOptions, createClient, sql} from '@pgkit/client'
import * as path from 'path'
import {beforeEach, vi as jest} from 'vitest'
import * as typegen from '../src'

export const connectionString =
  process.env.POSTGRES_CONNECTION_STRING || `postgresql://postgres:postgres@localhost:5432/postgres`
export const psqlCommand = process.env.POSTGRES_PSQL_COMMAND || `docker-compose exec -T postgres psql`

const admin = createClient(connectionString)

/** get an alt connection string, but for the specified db instead of the default */
const getConnectionString = (db: string) => connectionString.split('/').slice(0, -1).concat([db]).join('/')

export const getPureHelper = (params: {__filename: string}) => {
  const poolHelper = getPoolHelper({...params, baseConnectionURI: connectionString})
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(console.warn),
    error: jest.fn(console.error),
  }

  const typegenOptions = (baseDir: string): Partial<typegen.Options> => ({
    rootDir: baseDir,
    connectionString: poolHelper.pool.connectionString(), // no longer needed useful thing: can set search path via URL with `?options=--search_path%3dsome_schema`,
    poolConfig: poolHelper.pool.options,
    psqlCommand,
    logger,
    checkClean: [],
  })

  const setupAndGetOptions = async (baseDir: string) => {
    await poolHelper.setupDb()
    return typegenOptions(baseDir)
  }

  return {typegenOptions, setupAndGetOptions, poolHelper, logger}
}

export const getHelper = (params: {__filename: string}) => {
  const helper = getPureHelper(params)

  beforeEach(helper.poolHelper.setupDb)

  return helper
}

/**
 * Gets a pool suitable for use in tests. Creates a schema based on the passed-in test file name,
 * which is wiped before every test. Adds an afterAll listener which makes sure jest exits cleanly.
 */
export const getPoolHelper = (params: {__filename: string; baseConnectionURI: string; config?: ClientOptions}) => {
  const dbName = path.parse(params.__filename).name.replaceAll(/\W/g, '_')
  const schemaName = 'public'
  const schemaIdentifier = sql.identifier([schemaName])

  const pool = createClient(getConnectionString(dbName), {
    ...params.config,
    pgpOptions: {
      // schema: schemaName,
      // noWarnings: true,
      // ...params.config?.pgpOptions,
      ...params.config?.pgpOptions,
      initialize: {
        ...params.config?.pgpOptions?.initialize,
        noWarnings: true, // todo: remove
      },
      // connect: async ({client, useCount}) => {
      //   if (useCount === 0) {
      //     if (statementTimeout) await client.query(`set statement_timeout to '${statementTimeout}'`)
      //     if (lockTimeout) await client.query(`set lock_timeout = '${lockTimeout}'`)
      //   }
      // },
    },
    // idleTimeout: 1,
  })

  // // https://github.com/gajus/slonik/issues/63#issuecomment-500889445
  // afterAll(async () => new Promise(r => setTimeout(r, 1)))

  const setupDb = async () => {
    const exists = Boolean(await admin.maybeOne(sql`select 1 from pg_database where datname = ${dbName}`))
    if (!exists) {
      await admin.query(sql`create database ${sql.identifier([dbName])}`).catch(e => {
        if (e.message.endsWith('unique_violation')) return
        throw e
      })
    }

    await pool.query(sql`
      drop schema if exists ${schemaIdentifier} cascade;
      create schema ${schemaIdentifier}
    `)
  }

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
    setupDb,
    sql,
  }
}
