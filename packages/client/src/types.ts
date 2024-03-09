import pgPromise from 'pg-promise'

export interface SQLQuery<Result = Record<string, unknown>, Values extends unknown[] = unknown[]> {
  token: 'sql'
  name: string
  sql: string
  values: Values
  parse: (input: unknown) => Result
}

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

export type SQLParameterNonPrimitive = ReturnType<SQLTagHelpers[keyof SQLTagHelpers]> | SqlFragment

export type SQLParameter = SQLParameterNonPrimitive | Primitive
export type SQLParameterToken = SQLParameterNonPrimitive['token']

export type SQLTagFunction = <Result = Record<string, unknown>, Parameters extends SQLParameter[] = SQLParameter[]>(
  strings: TemplateStringsArray,
  ...parameters: Parameters
) => SQLQuery<Result>

export type SQLMethodHelpers = {
  raw: <T>(query: string) => SQLQuery<T, []>
  type: <Result extends Record<string, unknown>>(
    parser: ZodesqueType<Result>,
  ) => <Parameters extends SQLParameter[] = SQLParameter[]>(
    strings: TemplateStringsArray,
    ...parameters: Parameters
  ) => SQLQuery<Result>
}

export type PGTypes = ReturnType<typeof import('pg-promise')>['pg']['types']
export type ParseFn = Extract<Parameters<PGTypes['setTypeParser']>[number], Function>
export type PGTypesBuiltins = PGTypes['builtins']
export type PGTypesBuiltinOid = PGTypesBuiltins[keyof PGTypesBuiltins]

export type SetTypeParsers = (types: Pick<PGTypes, 'builtins' | 'setTypeParser'>) => void

export interface ClientOptions {
  pgpOptions?: Parameters<typeof pgPromise>[0]
  setTypeParsers?: (types: PGTypes) => void
  wrapQueryFn?: (queryFn: Queryable['query']) => Queryable['query']
}
