/* eslint-disable @typescript-eslint/no-explicit-any */
import pgPromise from 'pg-promise'
import {StandardSchemaV1} from './standard-schema/contract'

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

export interface AwaitableSQLQuery<Row = Record<string, unknown>, Values extends unknown[] = unknown[]>
  extends SQLQuery<Row, Values> {
  then: <U>(callback: (rows: Promise<AwaitSqlResultArray<Row>>) => U) => Promise<U>
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

  /** Returns a new Queryable which wraps the `query` method to throw an error if any row contains null values */
  noNulls: NonNullQueryable
}

export interface SQLQueryable extends Queryable {
  sql: SQLTag
}

export interface NonNullQueryable {
  query<Row>(query: SQLQuery<Row>): Promise<Result<NonNullRow<Row>>>

  one<Row>(query: SQLQuery<Row>): Promise<NonNullRow<Row>>
  maybeOne<Row>(query: SQLQuery<Row>): Promise<NonNullRow<Row> | null>

  oneFirst<Row>(query: SQLQuery<Row>): Promise<First<NonNullRow<Row>>>
  maybeOneFirst<Row>(query: SQLQuery<Row>): Promise<First<NonNullRow<Row>> | null>

  any<Row>(query: SQLQuery<Row>): Promise<NonNullRow<Row>[]>
  anyFirst<Row>(query: SQLQuery<Row>): Promise<Array<First<NonNullRow<Row>>>>

  many<Row>(query: SQLQuery<Row>): Promise<NonNullRow<Row>[]>
  manyFirst<Row>(query: SQLQuery<Row>): Promise<Array<First<NonNullRow<Row>>>>
}

/**
 * An augmented array type that includes helper getters which perform validation and type coercion on the rows.
 */
export type AwaitSqlResultArray<Row> = Row[] & {
  /** returns the single row in the array, @throws if the array length is not 1 */
  one: Row
  /** returns the single row in the array, or `null` if the array length is 0 */
  maybeOne: Row | null
  /** returns the first column of the single row in the array, @throws if the array length is not 1 */
  oneFirst: First<Row>
  /** returns the first column of the single row in the array, or `null` if the array length is 0 */
  maybeOneFirst: First<Row> | null

  // no `any` because this is already an array of the rows
  /** returns the first column of each row in the array */
  anyFirst: Array<First<Row>>
  /** returns all rows in the array and @throws if the array is empty */
  many: Row[]
  /** returns the first column of each row in the array and @throws if the array is empty */
  manyFirst: Array<First<Row>>

  /** returns a new array of results after checking that every record contains no null values */
  noNulls: AwaitSqlResultArray<NonNullRow<Row>>
}

export type NonNullRow<Row> = {
  [K in keyof Row]: NonNullable<Row[K]>
}

export interface Transactable extends SQLQueryable {
  transaction<T>(callback: (connection: Transaction) => Promise<T>): Promise<T>
}
export interface Connection extends Transactable {
  // todo: consolidate this with `transactionInfo`, and include a nullable `parent` property
  connectionInfo: {pgp: pgPromise.ITask<unknown> | pgPromise.IDatabase<unknown>}
}

export interface Transaction extends Connection {
  transactionInfo: {pgp: pgPromise.ITask<unknown>}
}

export interface Client extends SQLQueryable {
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
export type MemberType =
  | 'text'
  | 'bool'
  | 'bytea'
  | 'char'
  | 'name'
  | 'int2'
  | 'int4'
  | 'int8'
  | 'int2vector'
  | 'float4'
  | 'float8'
  | 'numeric'
  | 'regproc'
  | 'regclass'
  | 'regtype'
  | 'regoper'
  | 'regoperator'
  | 'regconfig'
  | 'regdictionary'
  | 'uuid'
  | 'json'
  | 'jsonb'
  | 'xml'
  | 'point'
  | 'lseg'
  | 'path'
  | 'box'
  | 'polygon'
  | 'line'
  | 'cidr'
  | 'inet'
  | 'macaddr'
  | 'macaddr8'
  | 'bit'
  | 'varbit'
  | 'timestamp'
  | 'timestamptz'
  | 'date'
  | 'time'
  | 'timetz'
  | 'interval'
  | 'money'
  | 'oid'
  | 'tid'
  | 'xid'
  | 'cid'
  | 'vector'
  | 'bpchar'
  | 'varchar'
  | 'array'
  | 'abstime'
  | 'reltime'
  | 'tinterval'
  | 'circle'
  | 'tsquery'
  | 'tsvector'
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

export type Primitive = string | number | boolean | null

export type SQLParameterNonPrimitive = ReturnType<SQLTagHelpers[keyof SQLTagHelpers]> | SqlFragment

export type SQLParameter = SQLParameterNonPrimitive | Primitive
export type SQLParameterToken = SQLParameterNonPrimitive['token']

/** the type definition for *just* the function part of the `sql` tag */
export type SQLTagFunction = <Row = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...parameters: Row extends {'~parameters': SQLParameter[]} ? Row['~parameters'] : SQLParameter[]
) => AwaitableSQLQuery<Row extends {'~parameters': SQLParameter[]} ? Omit<Row, '~parameters'> : Row>

/** the type definition for the helpers of the `sql` tag - these are helpers for creating parameters to go in a sql`...` template */
export type SQLTagHelpers = {
  [K in keyof SQLTagHelperParameters]: (...args: SQLTagHelperParameters[K]) => {
    token: K
    args: SQLTagHelperParameters[K]
  }
}

/** the type definition for the methods of the `sql` tag */
export type SQLMethodHelpers = {
  raw: <Row>(query: string, values?: unknown[]) => SQLQuery<Row, unknown[]>
  type: <Row>(
    schema: StandardSchemaV1<any, Row>,
  ) => <Parameters extends SQLParameter[] = SQLParameter[]>(
    strings: TemplateStringsArray,
    ...parameters: Parameters
  ) => AwaitableSQLQuery<Row>
}

/** the full type for the `sql` tag - callable function, helpers and all */
export type SQLTag = SQLTagFunction & SQLTagHelpers & SQLMethodHelpers

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
  wrapQueryFn?: (queryFn: SQLQueryable['query']) => SQLQueryable['query']
}
