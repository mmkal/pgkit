import {createPool, sql, ClientConfigurationInputType} from 'slonik'
import * as typegen from '../src'
import * as path from 'path'

export const baseConnectionURI =
  process.env.POSTGRES_CONNECTION_STRING || `postgresql://postgres:postgres@localhost:5433/postgres`
export const psqlCommand = process.env.POSTGRES_PSQL_COMMAND || `docker-compose exec -T postgres psql`

export const getHelper = (params: {__filename: string}) => {
  const poolHelper = getPoolHelper({...params, baseConnectionURI})
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(console.warn),
    error: jest.fn(console.error),
  }

  const typegenOptions = (baseDir: string): Partial<typegen.Options> => ({
    rootDir: baseDir,
    connectionURI: `${baseConnectionURI}?options=--search_path%3d${poolHelper.schemaName}`,
    poolConfig: poolHelper.pool.configuration,
    psqlCommand,
    logger,
    checkClean: [],
  })

  jest.setTimeout(30000)

  return {typegenOptions, poolHelper, logger}
}

export const getPoolHelper = (params: {
  __filename: string
  baseConnectionURI: string
  config?: ClientConfigurationInputType
}) => {
  const schemaName = path.parse(params.__filename).name.replace(/\W/g, '_')
  const schemaIdentifier = sql.identifier([schemaName])

  const pool = createPool(params.baseConnectionURI, {
    idleTimeout: 1,
    preferNativeBindings: false,
    ...params?.config,
    captureStackTrace: true,
    interceptors: [
      {
        afterPoolConnection: async (context, connection) => {
          await connection.query(sql`set search_path to ${schemaIdentifier}`)
          return null
        },
        queryExecutionError: (context, query, error: any, notices) => {
          if (context.stackTrace) {
            let message = `${error.message}`
            if (error.position?.match(/^\d+$/)) {
              const start = Number(error.position) - 1
              const end =
                query.sql
                  .split('')
                  .findIndex(
                    (ch, i, {length}) => (i > start + 10 && ch.match(/\W/)) || i === length - 1 || i > start + 30,
                  ) + 1
              message += ` - query: "${query.sql.slice(Math.max(0, start - 10), start)} >>>> ${query.sql.slice(
                start,
                end,
              )} <<<< ${query.sql.slice(end, end + 10)}"`
            }
            throw Object.assign(new Error(message), {
              stack:
                `${message}\n` +
                context.stackTrace
                  .map((site: any) => {
                    const location = `(${site.fileName}:${site.lineNumber}:${site.columnNumber})`
                    return `    at ${site.functionName || '[unknown]'} ${location}`
                  })
                  .join('\n'),
              cause: error,
            })
          }

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
