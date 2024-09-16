import * as crypto from 'node:crypto'
import TypeOverrides from 'pg/lib/type-overrides'
import pgPromise from 'pg-promise'
import {QueryError, errorFromUnknown} from './errors'
import {applyRecommendedTypeParsers} from './type-parsers'
import {Client, First, Queryable, SQLQueryRowType, ClientOptions, Connection, Transaction, Result} from './types'

export const identityParser = <T>(input: unknown): T => input as T

/** Intended for slonik <= 28 compatibility */
export const createPool = (connectionString: string): Client => {
  return createClient(connectionString)
}

const first = <T>(value: T): First<T> => Object.values(value as {})[0] as First<T>
const createQueryable = (query: Queryable['query']): Queryable => {
  return {
    query,
    async one(input) {
      const result = await query(input)
      if (result.rows.length !== 1) throw new QueryError('Expected one row', {query: input, result})
      return result.rows[0]
    },
    async maybeOne(input) {
      const result = await query(input)
      if (result.rows.length > 1) throw new QueryError('Expected at most one row', {query: input, result})
      return result.rows[0] ?? null
    },
    async any(input) {
      const result = await query(input)
      return result.rows
    },
    async anyFirst(input) {
      const result = await query(input)
      return result.rows.map(first)
    },
    async many(input) {
      const result = await query(input)
      if (result.rows.length === 0) throw new QueryError('Expected at least one row', {query: input, result})
      return result.rows
    },
    async manyFirst(input) {
      const result = await query(input)
      if (result.rows.length === 0) throw new QueryError('Expected at least one row', {query: input, result})
      return result.rows.map(first)
    },
    async maybeOneFirst(input) {
      const result = await query(input)
      if (result.rows.length > 1) throw new QueryError('Expected at most one row', {query: input, result})
      return result.rows.length === 1 ? first(result.rows[0]) : null
    },
    async oneFirst(input) {
      const result = await query(input)
      if (result.rows.length !== 1) throw new QueryError('Expected one row', {query: input, result})
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
      return Object.values(result.rows[0] as any)[0] as any
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createQueryFn = (pgpQueryable: pgPromise.ITask<any> | pgPromise.IDatabase<any>): Queryable['query'] => {
  return async query => {
    type Row = SQLQueryRowType<typeof query>
    let result: Result<Row>
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const {rows, command, rowCount, fields} = await pgpQueryable.result<any>(
        query.sql,
        query.values.length > 0 ? query.values : undefined,
      )
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result = {rows, command, rowCount, fields}
    } catch (err: unknown) {
      const error = errorFromUnknown(err)
      throw new QueryError(error.message, {query, error})
    }

    try {
      return {...result, rows: await Promise.all(result.rows.map(query.parse))}
    } catch (err: unknown) {
      const error = errorFromUnknown(err)
      throw new QueryError(`Parsing rows failed`, {query, error})
    }
  }
}

export const createClient = (connectionString: string, options: ClientOptions = {}): Client => {
  if (typeof connectionString !== 'string') throw new Error(`Expected connectionString, got ${typeof connectionString}`)
  if (!connectionString) throw new Error(`Expected a valid connectionString, got "${connectionString}"`)

  options = {
    applyTypeParsers: applyRecommendedTypeParsers,
    pgpOptions: {},
    ...options,
  }

  const types = new TypeOverrides()
  // note: this should be done "high up" in the app: https://stackoverflow.com/questions/34382796/where-should-i-initialize-pg-promise
  const initializedPgPromise = pgPromise(options.pgpOptions?.initialize)

  options.applyTypeParsers?.({
    setTypeParser: (id, parseFn) => types.setTypeParser(id, parseFn as (input: unknown) => unknown),
    builtins: initializedPgPromise.pg.types.builtins,
  })

  const createWrappedQueryFn: typeof createQueryFn = queryable => {
    const queryFn = createQueryFn(queryable)
    return options.wrapQueryFn ? options.wrapQueryFn(queryFn) : queryFn
  }

  const pgPromiseClient = initializedPgPromise({
    connectionString,
    types,
    ...options.pgpOptions?.connect,
  })

  const transactionFnFromTask =
    <U>(task: pgPromise.ITask<U> | pgPromise.IDatabase<U>): Connection['transaction'] =>
    async txCallback => {
      return task.tx({tag: crypto.randomUUID()}, async tx => {
        const pgSuiteTransaction: Transaction = {
          ...createQueryable(createWrappedQueryFn(tx)),
          transactionInfo: {pgp: tx},
          connectionInfo: {pgp: task},
          transaction: transactionFnFromTask(tx),
        }
        return txCallback(pgSuiteTransaction)
      })
    }

  const connect: Client['connect'] = async callback => {
    return pgPromiseClient.task({tag: crypto.randomUUID()}, async task => {
      const connectionInfo: Connection['connectionInfo'] = {pgp: task}
      const pgSuiteConnection: Connection = {
        connectionInfo,
        transaction: transactionFnFromTask(task),
        ...createQueryable(createWrappedQueryFn(task)),
      }

      return callback(pgSuiteConnection)
    })
  }

  return {
    options,
    pgp: pgPromiseClient,
    pgpOptions: options.pgpOptions || {},
    ...createQueryable(createWrappedQueryFn(pgPromiseClient)),
    connectionString: () => connectionString,
    end: async () => pgPromiseClient.$pool.end(),
    connect,
    transaction: transactionFnFromTask(pgPromiseClient),
  }
}
