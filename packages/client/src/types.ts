/* eslint-disable @typescript-eslint/no-explicit-any */
import pgPromise from 'pg-promise'

export interface SQLQuery<Row = Record<string, unknown>, Values extends unknown[] = unknown[]> {
  token: 'sql'
  name: string
  sql: string
  values: Values
  parse: (input: unknown) => Row | Promise<Row>
  /** @internal "segments" is the array of strings that make up the SQL query, including any parameter placeholders like `$1`, `$2`., and literals like dynamic table names, etc. It is joined together to form the `sql` property. */
  segments: () => string[]
  /** @internal */
  templateArgs: () => [strings: readonly string[], ...inputParameters: readonly unknown[]]
}

export type TimeUnit = 'years' | 'months' | 'weeks' | 'days' | 'hours' | 'minutes' | 'seconds'
export type IntervalInput = Partial<Record<TimeUnit, number>>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SQLQueryRowType<Query extends SQLQuery<any>> = ReturnType<Query['parse']>

export type SQLQueryParameter = {token: string}

export type First<T> = T[keyof T]

/** See https://node-postgres.com/apis/result - faithfully copied here to avoid a type dependency */
export interface FieldInfo {
  name: string
  dataTypeID: number
}

/** See https://node-postgres.com/apis/result - faithfully copied here to avoid a type dependency */
export interface Result<Row> {
  rows: Row[]
  fields: FieldInfo[]
  command: string
  rowCount: number | null
}

export type DriverQueryable = {
  result: <T>(query: string, values?: unknown[]) => Promise<Result<T>>
}

export interface Queryable {
  query<Row>(query: SQLQuery<Row>): Promise<Result<Row>>

  one<Row>(query: SQLQuery<Row>): Promise<Row>
  maybeOne<Row>(query: SQLQuery<Row>): Promise<Row | null>

  oneFirst<Row>(query: SQLQuery<Row>): Promise<First<Row>>
  maybeOneFirst<Row>(query: SQLQuery<Row>): Promise<First<Row> | null>

  any<Row>(query: SQLQuery<Row>): Promise<Row[]>
  anyFirst<Row>(query: SQLQuery<Row>): Promise<Array<First<Row>>>

  many<Row>(query: SQLQuery<Row>): Promise<Row[]>
  manyFirst<Row>(query: SQLQuery<Row>): Promise<Array<First<Row>>>
}

export interface Transactable extends Queryable {
  transaction<T>(callback: (connection: Transaction) => Promise<T>): Promise<T>
}
export interface Connection extends Transactable {
  // todo: consolidate this with `transactionInfo`, and include a nullable `parent` property
  connectionInfo: {pgp: pgPromise.ITask<unknown> | pgPromise.IDatabase<unknown>}
}

export interface Transaction extends Connection {
  transactionInfo: {pgp: pgPromise.ITask<unknown>}
}

export interface Client extends Queryable {
  options: ClientOptions
  pgp: ReturnType<ReturnType<typeof pgPromise>>
  pgpOptions: PGPOptions
  connectionString(): string
  end(): Promise<void>
  connect<T>(callback: (connection: Connection) => Promise<T>): Promise<T>
  task<T>(callback: (connection: Connection) => Promise<T>): Promise<T>
  transaction<T>(callback: (connection: Transaction) => Promise<T>): Promise<T>
}

export type PrimitiveValueExpression = Primitive
export type ValueExpression = Primitive | SqlFragment
export type MemberType = 'text'
export type SqlFragment = {
  token: 'sql'
  sql: string
  values: unknown[]
  /** @internal */
  templateArgs: () => [strings: readonly string[], ...inputParameters: readonly unknown[]]
}
/**
 * "string" type covers all type name identifiers – the literal values are added only to assist developer
 * experience with auto suggestions for commonly used type name identifiers.
 */

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
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
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

export type ZodesqueType<T> =
  | ZodesqueTypeSafe<T>
  | ZodesqueTypeAsyncSafe<T>
  | ZodesqueTypeAsyncUnsafe<T>
  | ZodesqueTypeUnsafe<T>
export type ZodesqueTypeUnsafe<T> = {parse: (input: unknown) => T}
export type ZodesqueTypeSafe<T> = {safeParse: (input: unknown) => ZodesqueResult<T>}
export type ZodesqueTypeAsyncUnsafe<T> = {parseAsync: (input: unknown) => Promise<T>}
export type ZodesqueTypeAsyncSafe<T> = {safeParseAsync: (input: unknown) => Promise<ZodesqueResult<T>>}
export type ZodesqueResult<T> = {success: true; data: T} | {success: false; error: Error}

export type SQLTagHelperParameters = {
  array: [values: readonly PrimitiveValueExpression[], memberType: MemberType]
  binary: [data: Buffer]
  date: [date: Date]
  fragment: [
    parts: TemplateStringsArray,
    ...values: readonly (ValueExpression | {token: 'sql' | keyof SQLTagHelperParameters})[],
  ]
  identifier: [names: readonly string[]]
  interval: [interval: IntervalInput]
  join: [members: readonly ValueExpression[], glue: SqlFragment]
  json: [value: unknown]
  jsonb: [value: unknown]
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

export type SQLParameterNonPrimitive = ReturnType<SQLTagHelpers[keyof SQLTagHelpers]> | SqlFragment

export type SQLParameter = SQLParameterNonPrimitive | Primitive
export type SQLParameterToken = SQLParameterNonPrimitive['token']

export type SQLTagFunction = <Row = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...parameters: Row extends {'~parameters': SQLParameter[]} ? Row['~parameters'] : SQLParameter[]
) => SQLQuery<Row extends {'~parameters': SQLParameter[]} ? Omit<Row, '~parameters'> : Row>

export type SQLMethodHelpers = {
  raw: <T>(query: string) => SQLQuery<T, []>
  type: <Row>(
    parser: ZodesqueType<Row>,
  ) => <Parameters extends SQLParameter[] = SQLParameter[]>(
    strings: TemplateStringsArray,
    ...parameters: Parameters
  ) => SQLQuery<Row>
}

/** Called `pgp` in pg-promise docs  */
export type PGPromiseInitializer = typeof pgPromise
/** Called `IMain` in pg-promise */
export type PGPromiseDBConnector = ReturnType<PGPromiseInitializer>
/** Looks like `[cn: string | pg.IConnectionParameters<pg.IClient>, dc?: any]` in pg-promise */
export type PGPromiseDBConnectorParameters = Parameters<PGPromiseDBConnector>
/** Looks like `pg.IConnectionParameters<pg.IClient>` in pg-promise */
export type PGPromiseDBConnectionOptions = Exclude<PGPromiseDBConnectorParameters[0], string>

export type PGTypes = ReturnType<typeof import('pg-promise')>['pg']['types']
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type ParseFn = Extract<Parameters<PGTypes['setTypeParser']>[number], Function>
export type PGTypesBuiltins = PGTypes['builtins']
export type PGTypesBuiltinOid = PGTypesBuiltins[keyof PGTypesBuiltins]

export type ApplyTypeParsers = (params: {
  setTypeParser: (oid: PGTypesBuiltinOid, parseFn: ParseFn) => void
  builtins: PGTypes['builtins']
}) => void

export type PGPOptions = {
  initialize?: pgPromise.IInitOptions
  connect?: PGPromiseDBConnectionOptions
}

export interface ClientOptions {
  pgpOptions?: PGPOptions
  applyTypeParsers?: ApplyTypeParsers
  wrapQueryFn?: (queryFn: Queryable['query']) => Queryable['query']
}
