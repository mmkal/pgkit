import * as path from 'path'
import {createPool, sql, ClientConfigurationInputType} from 'slonik'

/**
 * Gets a pool suitable for use in tests. Creates a schema based on the passed-in test file name,
 * which is wiped before every test. Adds an afterAll listener which makes sure jest exits cleanly.
 */
export const getPoolHelper = (params: {__filename: string; config?: ClientConfigurationInputType}) => {
  const schemaName = path.parse(params.__filename).name.replace(/\W/g, '_')
  const schemaIdentifier = sql.identifier([schemaName])

  const pool = createPool('postgresql://postgres:postgres@localhost:5433/postgres', {
    idleTimeout: 1,
    preferNativeBindings: false,
    ...params?.config,
    interceptors: [
      {
        afterPoolConnection: async (context, connection) => {
          await connection.query(sql`set search_path to ${schemaIdentifier}`)
          return null
        },
      },
      ...(params?.config?.interceptors ?? []),
    ],
  })

  // https://github.com/gajus/slonik/issues/63#issuecomment-500889445
  afterAll(() => new Promise(r => setTimeout(r, 1)))

  beforeEach(async () => {
    await pool.query(sql`drop schema if exists ${schemaIdentifier} cascade`)
    await pool.query(sql`create schema ${schemaIdentifier}`)
  })

  const mockLog = jest.fn()
  const mockLogger = {
    debug: mockLog,
    info: mockLog,
    warn: mockLog,
    error: mockLog,
  }

  /** Get the names from a list of migrations. Useful for light assertions */
  const names = (migrations: Array<{name: string}>) => migrations.map(m => m.name)

  return {pool, schemaName, schemaIdentifier, mockLogger, names, sql}
}
