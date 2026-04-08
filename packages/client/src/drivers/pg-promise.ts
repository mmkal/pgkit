import * as crypto from 'node:crypto'
import TypeOverrides from 'pg/lib/type-overrides'
import {ClientDriver, DriverInfo, DriverQueryable, DriverScope, PGPOptions} from '../types'

type PgPromiseTask = {
  result<T>(query: string, values?: unknown[]): Promise<T>
  tx<T>(options: {tag: string}, callback: (task: PgPromiseTask) => Promise<T>): Promise<T>
}

type PgPromiseDatabase = PgPromiseTask & {
  task<T>(options: {tag: string}, callback: (task: PgPromiseTask) => Promise<T>): Promise<T>
  $pool: {end(): Promise<void>}
}

type PgPromiseConnector = ((connect: Record<string, unknown>) => PgPromiseDatabase) & {
  pg: {types: {builtins: Record<string, number>}}
}

type PgPromiseInitializer = (options?: unknown) => PgPromiseConnector

export type PgPromiseDriverOptions = PGPOptions & {
  pgPromise?: PgPromiseInitializer
}

const createInfo = (raw: unknown): DriverInfo => ({name: 'pg-promise', raw, pgp: raw})

const createQueryable = (queryable: PgPromiseTask): DriverQueryable => ({
  result: async <T>(query: string, values?: unknown[]) => {
    return queryable.result<T>(query, values && values.length > 0 ? values : undefined)
  },
})

const createScope = (queryable: PgPromiseTask, connectionInfo: DriverInfo): DriverScope => ({
  info: createInfo(queryable),
  queryable: createQueryable(queryable),
  transaction: async callback => {
    return queryable.tx({tag: crypto.randomUUID()}, async transaction =>
      callback(createScope(transaction, connectionInfo)),
    )
  },
})

const getPgPromise = (override?: PgPromiseInitializer) => {
  if (override) return override
  try {
    return require('pg-promise') as PgPromiseInitializer
  } catch (cause) {
    throw new Error('The pg-promise driver requires `pg-promise` to be installed in your app.', {cause})
  }
}

export const createPgPromiseDriver = (options: PgPromiseDriverOptions = {}): ClientDriver => ({
  name: 'pg-promise',
  create({connectionString, applyTypeParsers}) {
    const pgPromise = getPgPromise(options.pgPromise)
    const initializedPgPromise = pgPromise(options.initialize)
    const types = new TypeOverrides()

    applyTypeParsers?.({
      setTypeParser: (id, parseFn) => types.setTypeParser(id, ((input: unknown) => parseFn(input as never)) as any),
      builtins: initializedPgPromise.pg.types.builtins as any,
    })

    const database = initializedPgPromise({
      connectionString,
      types,
      ...options.connect,
    })

    return {
      info: createInfo(database),
      queryable: createQueryable(database),
      end: async () => database.$pool.end(),
      connect: async callback => {
        return database.task({tag: crypto.randomUUID()}, async task => callback(createScope(task, createInfo(task))))
      },
      transaction: async callback => {
        return database.tx({tag: crypto.randomUUID()}, async transaction => {
          return callback(createScope(transaction, createInfo(database)))
        })
      },
    }
  },
})
