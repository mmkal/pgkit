import {createPgPromiseDriver} from './drivers/pg-promise'
import {QueryError, errorFromUnknown} from './errors'
import {createSqlTag} from './sql'
import {applyRecommendedTypeParsers} from './type-parsers'
import {
  Client,
  First,
  SQLQueryRowType,
  ClientOptions,
  Connection,
  DriverInfo,
  DriverScope,
  Transaction,
  Result,
  DriverQueryable,
  NonNullQueryable,
  Queryable,
  SQLQueryable,
} from './types'

export const identityParser = <T>(input: unknown): T => input as T

/** Intended for slonik <= 28 compatibility */
export const createPool = (connectionString: string): Client => {
  return createClient(connectionString)
}

const first = <T>(value: T): First<T> => Object.values(value as {})[0] as First<T>
const createQueryable = (query: Queryable['query']): SQLQueryable => {
  const queryable: Queryable = {
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
    get noNulls() {
      return createQueryable(async input => {
        const result = await query(input)
        for (const [i, row] of result.rows.entries()) {
          for (const [key, value] of Object.entries(row as {})) {
            if (value === null) throw new QueryError(`column ${key} in row index ${i} is null`, {query: input, result})
          }
        }
        return result
      }) as NonNullQueryable
    },
  }
  return Object.assign(queryable, {
    sql: createSqlTag({client: queryable}),
  })
}

export const createQueryFn = (pgpQueryable: DriverQueryable): Queryable['query'] => {
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
      throw new QueryError('Executing query failed', {cause: error, query})
    }

    try {
      return {...result, rows: await Promise.all(result.rows.map(query.parse))}
    } catch (err: unknown) {
      const error = errorFromUnknown(err)
      throw new QueryError(`Parsing rows failed`, {cause: error, query})
    }
  }
}

const getCompatibilityProps = (info: DriverInfo) => {
  const {name: _name, raw: _raw, ...compatibilityProps} = info
  return compatibilityProps
}

const createTransactionFactory = (
  scope: Pick<DriverScope, 'transaction'>,
  createTransaction: (transactionScope: DriverScope) => Transaction,
): Connection['transaction'] => {
  return async callback => scope.transaction(async transaction => callback(createTransaction(transaction)))
}

export const createClient = (connectionString: string, options: ClientOptions = {}): Client => {
  if (typeof connectionString !== 'string') throw new Error(`Expected connectionString, got ${typeof connectionString}`)
  if (!connectionString) throw new Error(`Expected a valid connectionString, got "${connectionString}"`)

  options = {
    applyTypeParsers: applyRecommendedTypeParsers,
    pgpOptions: {},
    ...options,
  }

  const driver = options.driver ?? createPgPromiseDriver(options.pgpOptions)

  const createWrappedQueryFn: typeof createQueryFn = queryable => {
    const queryFn = createQueryFn(queryable)
    return options.wrapQueryFn ? options.wrapQueryFn(queryFn) : queryFn
  }

  const runtime = driver.create({
    connectionString,
    applyTypeParsers: options.applyTypeParsers,
  })

  const createTransaction = (transactionScope: DriverScope, connectionInfo: DriverInfo): Transaction => {
    return {
      ...getCompatibilityProps(transactionScope.info),
      ...createQueryable(createWrappedQueryFn(transactionScope.queryable)),
      transactionInfo: transactionScope.info,
      connectionInfo,
      transaction: createTransactionFactory(transactionScope, nested => createTransaction(nested, connectionInfo)),
    }
  }

  const createConnection = (connectionScope: DriverScope): Connection => {
    const connectionInfo = connectionScope.info
    return {
      ...getCompatibilityProps(connectionInfo),
      ...createQueryable(createWrappedQueryFn(connectionScope.queryable)),
      connectionInfo,
      transaction: createTransactionFactory(connectionScope, transaction =>
        createTransaction(transaction, connectionInfo),
      ),
    }
  }

  const taskMethod: Client['task'] = async callback =>
    runtime.connect(async connection => callback(createConnection(connection)))

  return {
    options,
    ...getCompatibilityProps(runtime.info),
    driverInfo: runtime.info,
    pgpOptions: options.pgpOptions || {},
    ...createQueryable(createWrappedQueryFn(runtime.queryable)),
    connectionString: () => connectionString,
    end: async () => runtime.end(),
    connect: taskMethod,
    task: taskMethod,
    transaction: async callback =>
      runtime.transaction(async transaction => callback(createTransaction(transaction, runtime.info))),
  }
}
