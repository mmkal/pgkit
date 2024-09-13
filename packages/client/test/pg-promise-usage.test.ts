import {test, expect} from 'vitest'
import {createClient, sql} from '../src'

test("type parsers don't override each other", async () => {
  const client1 = createClient('postgresql://postgres:postgres@localhost:5432/postgres', {
    applyTypeParsers: types => {
      types.setTypeParser(types.builtins.INT8, Number)
    },
  })
  const client2 = createClient('postgresql://postgres:postgres@localhost:5432/postgres', {
    applyTypeParsers: types => {
      types.setTypeParser(types.builtins.INT8, BigInt)
    },
  })

  const result1 = await client1.one(sql`select 1::int8 as one`)
  const result2 = await client2.one(sql`select 1::int8 as two`)
  expect(result1).toEqual({one: 1})
  expect(result2).toEqual({two: 1n})
})
