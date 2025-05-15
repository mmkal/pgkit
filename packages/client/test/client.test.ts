import {beforeAll, beforeEach, expect, test} from 'vitest'
import {createClient, sql} from '../src'

let client: Awaited<ReturnType<typeof createClient>>

beforeAll(async () => {
  client = createClient('postgresql://postgres:postgres@localhost:5432/postgres')
})

beforeEach(async () => {
  await client.query(sql`DROP TABLE IF EXISTS client_test`)
  await client.query(sql`CREATE TABLE client_test (id int, name text)`)
  await client.query(sql`INSERT INTO client_test VALUES (1, 'one'), (2, 'two'), (3, 'three')`)
})

test('pool', async () => {
  const result1 = await client.one(sql`SELECT 1 as foo`)
  expect(result1).toEqual({foo: 1})

  const result2 = await client.connect(async connection => {
    return connection.one(sql`SELECT 1 as foo`)
  })
  expect(result2).toEqual(result1)
  const result3 = await client.transaction(async tx => {
    return tx.one(sql`SELECT 1 as foo`)
  })
  expect(result3).toEqual(result1)
  const result4 = await client.connect(async conn => {
    return conn.transaction(async tx => {
      return tx.one(sql`SELECT 1 as foo`)
    })
  })
  expect(result4).toEqual(result1)
})

test('raw', async () => {
  const result1 = await client.any(sql.raw(`SELECT 1 as foo`))
  expect(result1).toEqual([{foo: 1}])

  const result2 = await client.any(sql.raw<{foo: number}>(`SELECT $1 as foo`, [111]))
  expect(result2).toEqual([{foo: 111}])
})
