import * as crypto from 'node:crypto'
import pgPromise from 'pg-promise'
import {pgErrorCodes} from './errors'
import {nameQuery} from './naming'

export interface SQLQuery<Result = Record<string, unknown>, Values extends unknown[] = unknown[]> {
  token: 'sql'
  name: string
  sql: string
  values: Values
  parse: (input: unknown) => Result
}

export const identityParser = <T>(input: unknown): T => input as T

export type TimeUnit = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds'
export type IntervalInput = Partial<Record<TimeUnit, number>> // todo type-fest oneOf

export type SQLQueryResult<Query extends SQLQuery<any>> = ReturnType<Query['parse']>

export type SQLQueryParameter = {token: string}

export type First<T> = T[keyof T]

export interface Queryable {
  query<Result>(query: SQLQuery<Result>): Promise<{rows: Result[]}>

  one<Result>(query: SQLQuery<Result>): Promise<Result>
  maybeOne<Result>(query: SQLQuery<Result>): Promise<Result | null>

  oneFirst<Result>(query: SQLQuery<Result>): Promise<First<Result>>
  maybeOneFirst<Result>(query: SQLQuery<Result>): Promise<First<Result> | null>

  any<Result>(query: SQLQuery<Result>): Promise<Result[]>
  anyFirst<Result>(query: SQLQuery<Result>): Promise<Array<First<Result>>>

  many<Result>(query: SQLQuery<Result>): Promise<Result[]>
  manyFirst<Result>(query: SQLQuery<Result>): Promise<Array<First<Result>>>
}

export interface Connection extends Queryable {
  // todo: consolidate this with `transactionInfo`, and include a nullable `parent` property
  connectionInfo: {pgp: pgPromise.ITask<unknown> | pgPromise.IDatabase<unknown>}
  transaction<T>(callback: (connection: Transaction) => Promise<T>): Promise<T>
}

export interface Transaction extends Connection {
  transactionInfo: {pgp: pgPromise.ITask<unknown>}
}

export interface Client extends Queryable {
  options: ClientOptions
  pgp: ReturnType<ReturnType<typeof pgPromise>>
  pgpOptions: Parameters<typeof pgPromise>[0]
  connectionString(): string
  end(): Promise<void>
  connect<T>(callback: (connection: Connection) => Promise<T>): Promise<T>
  transaction<T>(callback: (connection: Transaction) => Promise<T>): Promise<T>
}

export type PrimitiveValueExpression = Primitive
export type ValueExpression = Primitive | SqlFragment
export type MemberType = 'text'
export type SqlFragment = {
  token: 'sql'
  sql: string
  values: unknown[]
}

/**
 * "string" type covers all type name identifiers – the literal values are added only to assist developer
 * experience with auto suggestions for commonly used type name identifiers.
 */
export type TypeNameIdentifier =
  | string
  | 'bool'
  | 'bytea'
  | 'float4'
  | 'float8'
  | 'int2'
  | 'int4'
  | 'int8'
  | 'json'
  | 'text'
  | 'timestamptz'
  | 'uuid'

export type ZodesqueType<T> = ZodesqueTypeUnsafe<T> | ZodesqueTypeSafe<T>
export type ZodesqueTypeUnsafe<T> = {parse: (input: unknown) => T}
export type ZodesqueTypeSafe<T> = {
  safeParse: (
    input: unknown,
  ) => {success: true; data: T; error: undefined} | {success: false; error: Error; data: undefined}
}

export type SQLTagHelperParameters = {
  array: [values: readonly PrimitiveValueExpression[], memberType: MemberType]
  binary: [data: Buffer]
  date: [date: Date]
  fragment: [parts: TemplateStringsArray]
  identifier: [names: readonly string[]]
  interval: [interval: IntervalInput]
  join: [members: readonly ValueExpression[], glue: SqlFragment]
  json: [value: any]
  jsonb: [value: any]
  literalValue: [value: string]
  timestamp: [date: Date]
  unnest: [tuples: ReadonlyArray<readonly PrimitiveValueExpression[]>, columnTypes: TypeNameIdentifier[]]
}

export type SQLTagHelpers = {
  [K in keyof SQLTagHelperParameters]: (...args: SQLTagHelperParameters[K]) => {
    token: K
    args: SQLTagHelperParameters[K]
  }
}

export type Primitive = string | number | boolean | null

type SQLParameterNonPrimitive = ReturnType<SQLTagHelpers[keyof SQLTagHelpers]> | SqlFragment

export type SQLParameter = SQLParameterNonPrimitive | Primitive
export type SQLParameterToken = SQLParameterNonPrimitive['token']

export type SQLTagFunction = <Result = Record<string, unknown>, Parameters extends SQLParameter[] = SQLParameter[]>(
  strings: TemplateStringsArray,
  ...parameters: Parameters
) => SQLQuery<Result>

const sqlFn: SQLTagFunction = (strings, ...inputParameters) => {
  let sql = ''
  const values: unknown[] = []

  // eslint-disable-next-line complexity
  strings.forEach((string, i) => {
    sql += string
    if (!(i in inputParameters)) {
      return
    }

    const param = inputParameters[i]
    if (!param || typeof param !== 'object') {
      values.push(param ?? null)
      sql += '$' + values.length
      return
    }

    switch (param.token) {
      case 'array':
      case 'binary':
      case 'date':
      case 'json':
      case 'jsonb':
      case 'timestamp': {
        values.push(param.args[0])
        sql += '$' + values.length
        break
      }

      case 'literalValue': {
        sql += pgPromise.as.value(param.args[0])
        break
      }

      case 'interval': {
        sql += 'make_interval('
        Object.entries(param.args[0]).forEach(([unit, value], j, {length}) => {
          values.push(unit)
          sql += '$' + values.length + ':name'
          values.push(value)
          sql += ` => $${values.length}`
          if (j < length - 1) sql += ', '
        })
        sql += ')'
        break
      }

      case 'join': {
        param.args[0].forEach((value, j, {length}) => {
          if (value && typeof value === 'object' && value?.token === 'sql') {
            sql += value.sql
            if (j < length - 1) sql += param.args[1].sql
            return
          }

          values.push(value)
          sql += '$' + values.length
          if (j < length - 1) sql += param.args[1].sql
        })
        break
      }

      case 'sql': {
        if (param.values?.length) {
          throw new QueryError(`Can't handle nested SQL with parameters`, {
            cause: {query: {name: nameQuery(strings), sql, values: inputParameters}},
          })
        }

        sql += param.sql
        // values.push(...param.values);
        break
      }

      case 'identifier': {
        param.args[0].forEach((name, j, {length}) => {
          values.push(name)
          sql += '$' + values.length + ':name'
          if (j < length - 1) sql += '.'
        })
        break
      }

      case 'unnest': {
        sql += 'unnest('
        param.args[1].forEach((typename, j, {length}) => {
          const valueArray = param.args[0].map(tuple => tuple[j])
          values.push(valueArray)
          sql += '$' + values.length + '::' + typename + '[]'
          if (j < length - 1) sql += ', '
        })
        sql += ')'
        break
      }

      case 'fragment': {
        sql += param.args[0][0]
        break
      }

      default: {
        // satisfies never ensures exhaustive
        const unexpected = param satisfies never as (typeof inputParameters)[number]
        throw new QueryError(
          `Unknown type ${unexpected && typeof unexpected === 'object' ? unexpected.token : typeof unexpected}`,
          {
            cause: {query: {name: nameQuery(strings), sql, values: inputParameters}},
          },
        )
      }
    }
  })

  return {
    parse: input => input as any,
    name: nameQuery(strings),
    sql,
    token: 'sql',
    values,
  }
}

export type SQLMethodHelpers = {
  raw: <T>(query: string) => SQLQuery<T, []>
  type: <Result extends Record<string, unknown>>(
    parser: ZodesqueType<Result>,
  ) => <Parameters extends SQLParameter[] = SQLParameter[]>(
    strings: TemplateStringsArray,
    ...parameters: Parameters
  ) => SQLQuery<Result>
}

const otherHelpers: SQLMethodHelpers = {
  raw: <T>(query: string): SQLQuery<T, []> => ({
    sql: query,
    parse: input => input as T,
    name: nameQuery([query]),
    token: 'sql',
    values: [],
  }),
  type:
    type =>
    (strings, ...parameters) => {
      return {
        parse(input) {
          if ('safeParse' in type) {
            const parsed = type.safeParse(input)
            if (!parsed.success) {
              throw parsed.error
            }

            return parsed.data
          }

          return type.parse(input)
        },
        name: nameQuery(strings),
        sql: strings.join(''),
        token: 'sql',
        values: parameters,
      }
    },
}

export const sql: SQLTagFunction & SQLTagHelpers & SQLMethodHelpers = Object.assign(sqlFn, otherHelpers, {
  array: (...args) => ({token: 'array', args}),
  binary: (...args) => ({token: 'binary', args}),
  date: (...args) => ({token: 'date', args}),
  fragment: (...args) => ({token: 'fragment', args}),
  identifier: (...args) => ({token: 'identifier', args}),
  interval: (...args) => ({token: 'interval', args}),
  join: (...args) => ({token: 'join', args}),
  json: (...args) => ({token: 'json', args}),
  jsonb: (...args) => ({token: 'jsonb', args}),
  literalValue: (...args) => ({token: 'literalValue', args}),
  timestamp: (...args) => ({token: 'timestamp', args}),
  unnest: (...args) => ({token: 'unnest', args}),
} satisfies SQLTagHelpers)

export const createSqlTag = <TypeAliases extends Record<string, ZodesqueType<any>>>(params: {
  typeAliases: TypeAliases
}) => {
  const fn: typeof sqlFn = (...args) => sqlFn(...args)
  return Object.assign(fn, sqlFn, {
    params,
    typeAlias<K extends keyof TypeAliases>(name: K) {
      const type = params.typeAliases[name]
      type Result = typeof type extends ZodesqueType<infer R> ? R : never
      // eslint-disable-next-line mmkal/@typescript-eslint/no-unnecessary-type-assertion
      return sql.type(type) as <Parameters extends SQLParameter[] = SQLParameter[]>(
        strings: TemplateStringsArray,
        ...parameters: Parameters
      ) => SQLQuery<Result>
    },
  })
}

export class QueryError extends Error {
  cause!: {
    query: Pick<SQLQuery<unknown>, 'name'> & Partial<SQLQuery<unknown>>
    error?: Error
    result?: {rows: any[]}
  }

  constructor(message: string, {cause}: {cause: QueryError['cause']}) {
    super(`[Query ${cause.query.name}]: ${message}`, {cause})
    this.cause = cause
  }

  /** Get the PostgreSQL error code, if this was caused by an underlying pg error. Docs: https://www.postgresql.org/docs/current/errcodes-appendix.html */
  get pg_code(): number | undefined {
    return (this.cause.error as {code?: number})?.code
  }

  /** Get the name for the PostgreSQL error code, if this was caused by an underlying pg error. Docs: https://www.postgresql.org/docs/current/errcodes-appendix.html */
  get pg_code_name(): string | undefined {
    const code = this.pg_code
    return code ? pgErrorCodes[code] : undefined
  }
}

/** Intended for slonik <= 20 compatibility */
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
      // eslint-disable-next-line mmkal/@typescript-eslint/no-unsafe-argument
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

export const pgTypes = pgPromise().pg.types

export type PGTypes = ReturnType<typeof pgPromise>['pg']['types']
export type ParseFn = Extract<Parameters<PGTypes['setTypeParser']>[number], Function>
export type PGTypesBuiltins = PGTypes['builtins']
export type PGTypesBuiltinOid = PGTypesBuiltins[keyof PGTypesBuiltins]

export type SetTypeParsers = (types: Pick<PGTypes, 'builtins' | 'setTypeParser'>) => void

export const setRecommendedTypeParsers: SetTypeParsers = types => {
  types.setTypeParser(types.builtins.DATE, value => new Date(value))
  types.setTypeParser(types.builtins.TIMESTAMPTZ, value => new Date(value))
  types.setTypeParser(types.builtins.TIMESTAMP, value => value)
  types.setTypeParser(types.builtins.INTERVAL, value => value)
  types.setTypeParser(types.builtins.NUMERIC, Number)
  types.setTypeParser(types.builtins.INT2, Number)
  types.setTypeParser(types.builtins.INT4, Number)
  types.setTypeParser(types.builtins.INT8, Number)
  types.setTypeParser(types.builtins.BOOL, value => value === 't')
}

/**
 * Equivalent of slonik type parsers in `createTypeParserPreset`. [Docs](https://www.npmjs.com/package/slonik#default-configuration)
 */
export const setSlonik37TypeParsers: SetTypeParsers = types => {
  types.setTypeParser(types.builtins.DATE, value => new Date(value))
  types.setTypeParser(types.builtins.TIMESTAMPTZ, value => new Date(value).getTime())
  types.setTypeParser(types.builtins.TIMESTAMP, value => new Date(value).getTime())
  types.setTypeParser(types.builtins.INTERVAL, value => value)
  types.setTypeParser(types.builtins.NUMERIC, Number)
}

export interface ClientOptions {
  pgpOptions?: Parameters<typeof pgPromise>[0]
  setTypeParsers?: (types: PGTypes) => void
  wrapQueryFn?: (queryFn: Queryable['query']) => Queryable['query']
}

export const createClient = (connectionString: string, options: ClientOptions = {}): Client => {
  const {pgpOptions = {}, setTypeParsers = setRecommendedTypeParsers, wrapQueryFn = fn => fn} = options
  const pgp = pgPromise(pgpOptions)

  setTypeParsers(pgp.pg.types)

  const createWrappedQueryFn: typeof createQueryFn = queryable => wrapQueryFn(createQueryFn(queryable))

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
    // eslint-disable-next-line mmkal/@typescript-eslint/no-base-to-string
    connectionString: () => client.$cn.toString(),
    end: async () => client.$pool.end(),
    connect,
    transaction: transactionFnFromTask(client),
  }
}

function errorFromUnknown(err: unknown) {
  return err instanceof Error ? err : new Error(`Non error thrown: ${String(err)}`, {cause: err})
}

export {nameQuery} from './naming'
