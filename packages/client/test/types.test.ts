import {beforeAll, beforeEach, expect, expectTypeOf, test} from 'vitest'
import {createClient, sql} from '../src'

export let client: Awaited<ReturnType<typeof createClient>>

expect.addSnapshotSerializer({
  test: () => true,
  print: val => JSON.stringify(val, null, 2),
})

beforeAll(async () => {
  client = createClient('postgresql://postgres:postgres@localhost:5432/postgres')
})

beforeEach(async () => {
  await client.query(sql`
    drop table if exists test_table;
    create table test_table(id int, label text);
    insert into test_table values (1, 'a'), (2, 'b'), (3, null);
  `)
})

test('row type', async () => {
  type Row1 = {
    id: number
    location: {lat: number; lon: number}
    label: string | null
  }

  const result1 = await client.one(sql<Row1>`
    select * from test_table limit 1
  `)

  expectTypeOf(result1).toEqualTypeOf<Row1>()
})

test('row type with parameters', async () => {
  type Row2 = {
    id: number
    location: {lat: number; lon: number}
    label: string | null
    '~parameters': [number, string]
  }
  const query = sql<Row2>`
    select * from test_table
    where id <= ${2}
    and label = ${'a'}
  `
  const result2 = await client.one(query)

  expectTypeOf(result2).toEqualTypeOf<{
    id: number
    location: {lat: number; lon: number}
    label: string | null
  }>()

  const _unused = sql<Row2>`
    select * from test_table
    where id <= ${2}
    and label = ${
      // @ts-expect-error supposed to be a string
      22
    }
  `
})
