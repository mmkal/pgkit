import {beforeAll, beforeEach, expect, test} from 'vitest'
import {createClient, sql} from '../src'

export let client: Awaited<ReturnType<typeof createClient>>

beforeAll(async () => {
  client = createClient('postgresql://postgres:postgres@localhost:5432/postgres')
})

beforeEach(async () => {
  await client.query(sql`DROP TABLE IF EXISTS type_parsers_test`)
  await client.query(sql`CREATE TABLE type_parsers_test (id int, name text)`)
  await client.query(sql`INSERT INTO type_parsers_test VALUES (1, 'one'), (2, 'two'), (3, 'three')`)
})

test('type parsers', async () => {
  const result = await client.one(sql`
    select
      ${sql.interval({days: 1})} as day_interval,
      ${sql.interval({hours: 1})} as hour_interval,
      true as so,
      false as not_so,
      0.4::float4 as float4,
      0.8::float8 as float8,
      '{"a":1}'::json as json,
      '{"a":1}'::jsonb as jsonb,
      '{a,b,c}'::text[] as arr,
      array(select id from type_parsers_test) as arr2,
      '2000-01-01T12:00:00Z'::timestamptz as timestamptz,
      '2000-01-01T12:00:00Z'::timestamp as timestamp,
      '2000-01-01T12:00:00Z'::date as date,
      (select count(*) from type_parsers_test where id = -1) as count
  `)

  expect(result).toMatchInlineSnapshot(`
    {
      "arr": [
        "a",
        "b",
        "c",
      ],
      "arr2": [
        1,
        2,
        3,
      ],
      "count": 0,
      "date": 2000-01-01T00:00:00.000Z,
      "day_interval": "1 day",
      "float4": 0.4,
      "float8": 0.8,
      "hour_interval": "01:00:00",
      "json": {
        "a": 1,
      },
      "jsonb": {
        "a": 1,
      },
      "not_so": false,
      "so": true,
      "timestamp": "2000-01-01 12:00:00",
      "timestamptz": 2000-01-01T12:00:00.000Z,
    }
  `)
})
