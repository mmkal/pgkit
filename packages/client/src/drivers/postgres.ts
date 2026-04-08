import {types as pgTypes} from 'pg'
import {ClientDriver, DriverInfo, DriverQueryable, DriverScope, ParseFn, PGTypesBuiltins} from '../types'

type PostgresSql = {
  unsafe<T>(query: string, values: unknown[]): Promise<T[] & {columns?: Array<{name: string; type: number}>; command: string; count: number}>
  reserve(): Promise<PostgresSql & {release(): Promise<void>}>
  begin<T>(callback: (sql: PostgresSql) => Promise<T>): Promise<T>
  savepoint<T>(callback: (sql: PostgresSql) => Promise<T>): Promise<T>
  end(): Promise<void>
}

type PostgresModule = (connectionString?: string, options?: Record<string, unknown>) => PostgresSql

export type PostgresDriverOptions = Record<string, unknown> & {
  types?: Record<string, unknown>
}

const getPostgres = () => require('postgres') as PostgresModule

const createInfo = (raw: unknown): DriverInfo => ({name: 'postgres', raw})

const createQueryable = (sql: PostgresSql): DriverQueryable => ({
  result: async <T>(query: string, values?: unknown[]) => {
    const result = await sql.unsafe<T[]>(query, values ?? [])
    return {
      rows: result as unknown as T[],
      fields: (result.columns ?? []).map((column: {name: string; type: number}) => ({name: column.name, dataTypeID: column.type})),
      command: result.command,
      rowCount: result.count,
    }
  },
})

const createScope = (sql: PostgresSql, connectionInfo: DriverInfo, inTransaction: boolean): DriverScope => ({
  info: createInfo(sql),
  queryable: createQueryable(sql),
  transaction: async callback => {
    if (inTransaction && typeof sql.savepoint === 'function') {
      return sql.savepoint(async (transaction: PostgresSql) => callback(createScope(transaction, connectionInfo, true)))
    }

    if (!inTransaction && typeof sql.begin === 'function') {
      return sql.begin(async (transaction: PostgresSql) => callback(createScope(transaction, connectionInfo, true)))
    }

    await sql.unsafe('begin', [])
    try {
      const result = await callback(createScope(sql, connectionInfo, true))
      await sql.unsafe('commit', [])
      return result
    } catch (error) {
      await sql.unsafe('rollback', [])
      throw error
    }
  },
})

const createPostgresTypes = (builtins: PGTypesBuiltins, applyTypeParsers?: (params: {
  setTypeParser: (oid: number, parseFn: ParseFn) => void
  builtins: PGTypesBuiltins
}) => void) => {
  if (!applyTypeParsers) return undefined
  const parsers = new Map<number, ParseFn>()
  applyTypeParsers({
    setTypeParser: (oid, parseFn) => parsers.set(oid, parseFn),
    builtins,
  })
  return Object.fromEntries(
    [...parsers.entries()].map(([oid, parse], index) => [
      `oid_${oid}_${index}`,
      {
        from: [oid],
        serialize: (value: unknown) => value,
        parse,
      },
    ]),
  )
}

export const createPostgresDriver = (options: PostgresDriverOptions = {}): ClientDriver => ({
  name: 'postgres',
  create({connectionString, applyTypeParsers}) {
    const postgres = getPostgres()
    const builtins = pgTypes.builtins as PGTypesBuiltins
    const sql = postgres(connectionString, {
      ...options,
      types: {
        ...createPostgresTypes(builtins, applyTypeParsers),
        ...options.types,
      },
    })

    return {
      info: createInfo(sql),
      queryable: createQueryable(sql),
      end: async () => {
        await sql.end()
      },
      connect: async callback => {
        const reserved = await sql.reserve()
        try {
          return await callback(createScope(reserved, createInfo(reserved), false))
        } finally {
          await reserved.release()
        }
      },
      transaction: async callback => {
        return sql.begin(async (transaction: PostgresSql) => callback(createScope(transaction, createInfo(sql), true)))
      },
    }
  },
})
