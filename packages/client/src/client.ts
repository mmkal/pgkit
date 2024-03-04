import * as crypto from 'node:crypto'
import pgPromise from 'pg-promise'
import {QueryError, errorFromUnknown} from './errors'
import {setRecommendedTypeParsers} from './type-parsers'
import {Client, First, Queryable, SQLQueryResult, ClientOptions, Connection, Transaction} from './types'

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
      if (result.rows.length !== 1) throw new QueryError('Expected one row', {cause: {query: input, result}})
      return result.rows[0]
    },
    async maybeOne(input) {
      const result = await query(input)
      if (result.rows.length > 1)
        throw new QueryError('Expected at most one row', {
          cause: {query: input, result},
        })
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
      if (result.rows.length === 0)
        throw new QueryError('Expected at least one row', {
          cause: {query: input, result},
        })
      return result.rows
    },
    async manyFirst(input) {
      const result = await query(input)
      if (result.rows.length === 0)
        throw new QueryError('Expected at least one row', {
          cause: {query: input, result},
        })
      return result.rows.map(first)
    },
    async maybeOneFirst(input) {
      const result = await query(input)
      if (result.rows.length > 1)
        throw new QueryError('Expected at most one row', {
          cause: {query: input, result},
        })
      return result.rows.length === 1 ? first(result.rows[0]) : null
    },
    async oneFirst(input) {
      const result = await query(input)
      if (result.rows.length !== 1) throw new QueryError('Expected one row', {cause: {query: input, result}})
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return Object.values(result.rows[0] as any)[0] as any
    },
  }
}

export const createQueryFn = (pgpQueryable: pgPromise.ITask<any> | pgPromise.IDatabase<any>): Queryable['query'] => {
  return async query => {
    try {
      type Result = SQLQueryResult<typeof query>
      const result = await pgpQueryable.query<Result[]>(query.sql, query.values.length > 0 ? query.values : undefined)
      if (query.parse === identityParser) {
        return {rows: result}
      }

      return {rows: result.map(query.parse)}
    } catch (err: unknown) {
      const error = errorFromUnknown(err)
      throw new QueryError(error.message, {
        cause: {query, error},
      })
    }
  }
}

export const createClient = (connectionString: string, options: ClientOptions = {}): Client => {
  const {pgpOptions = {}, setTypeParsers = setRecommendedTypeParsers, wrapQueryFn} = options
  const pgp = pgPromise(pgpOptions)

  setTypeParsers(pgp.pg.types)

  const createWrappedQueryFn: typeof createQueryFn = queryable => {
    const queryFn = createQueryFn(queryable)
    return wrapQueryFn ? wrapQueryFn(queryFn) : queryFn
  }

  const client = pgp(connectionString)

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
    return client.task({tag: crypto.randomUUID()}, async task => {
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
    pgp: client,
    pgpOptions,
    ...createQueryable(createWrappedQueryFn(client)),
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    connectionString: () => client.$cn.toString(),
    end: async () => client.$pool.end(),
    connect,
    transaction: transactionFnFromTask(client),
  }
}
