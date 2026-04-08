import * as crypto from 'node:crypto'
import {Pool, PoolClient, PoolConfig, types as pgTypes} from 'pg'
import TypeOverrides from 'pg/lib/type-overrides'
import {ClientDriver, DriverInfo, DriverQueryable, DriverScope} from '../types'

const createInfo = (raw: unknown): DriverInfo => ({name: 'pg', raw})

const toResult = async <T>(
  queryable: {query(query: string, values?: unknown[]): Promise<any>},
  query: string,
  values?: unknown[],
) => {
  const result = await queryable.query(query, values)
  return {
    rows: result.rows as T[],
    fields: result.fields,
    command: result.command,
    rowCount: result.rowCount,
  }
}

const createQueryable = (queryable: {query(query: string, values?: unknown[]): Promise<any>}): DriverQueryable => ({
  result: async <T>(query: string, values?: unknown[]) => toResult<T>(queryable, query, values),
})

const savepointName = () => `pgkit_${crypto.randomUUID().replaceAll('-', '_')}`

const createScope = (client: PoolClient, connectionInfo: DriverInfo, inTransaction: boolean): DriverScope => ({
  info: createInfo(client),
  queryable: createQueryable(client),
  transaction: async callback => {
    const savepoint = savepointName()
    await client.query(inTransaction ? `savepoint ${savepoint}` : 'begin')
    try {
      const result = await callback(createScope(client, connectionInfo, true))
      await client.query(inTransaction ? `release savepoint ${savepoint}` : 'commit')
      return result
    } catch (error) {
      await client.query(inTransaction ? `rollback to savepoint ${savepoint}` : 'rollback')
      throw error
    }
  },
})

export type PgDriverOptions = PoolConfig

export const createPgDriver = (options: PgDriverOptions = {}): ClientDriver => ({
  name: 'pg',
  create({connectionString, applyTypeParsers}) {
    const types = new TypeOverrides()
    applyTypeParsers?.({
      setTypeParser: (id, parseFn) => types.setTypeParser(id, ((input: unknown) => parseFn(input as never)) as any),
      builtins: pgTypes.builtins,
    })

    const pool = new Pool({
      connectionString,
      types,
      ...options,
    })

    return {
      info: createInfo(pool),
      queryable: createQueryable(pool),
      end: async () => pool.end(),
      connect: async callback => {
        const client = await pool.connect()
        try {
          return await callback(createScope(client, createInfo(client), false))
        } finally {
          client.release()
        }
      },
      transaction: async callback => {
        const client = await pool.connect()
        try {
          return await createScope(client, createInfo(pool), false).transaction(callback)
        } finally {
          client.release()
        }
      },
    }
  },
})
