import {beforeAll, beforeEach, expect, expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import {createClient, createPool, createSqlTag, sql} from '../src'

let pool: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  pool = createPool('postgresql://postgres:postgres@localhost:5432/postgres')
})

beforeEach(async () => {
  await pool.query(sql`DROP TABLE IF EXISTS test_pgsuite`)
  await pool.query(sql`CREATE TABLE test_pgsuite (id int, name text)`)
  await pool.query(sql`INSERT INTO test_pgsuite VALUES (1, 'one'), (2, 'two'), (3, 'three')`)
})

test('pool', async () => {
  const result1 = await pool.one(sql`SELECT 1 as foo`)
  expect(result1).toEqual({foo: 1})

  const result2 = await pool.connect(async connection => {
    return connection.one(sql`SELECT 1 as foo`)
  })
  expect(result2).toEqual(result1)
  const result3 = await pool.transaction(async tx => {
    return tx.one(sql`SELECT 1 as foo`)
  })
  expect(result3).toEqual(result1)
  const result4 = await pool.connect(async conn => {
    return conn.transaction(async tx => {
      return tx.one(sql`SELECT 1 as foo`)
    })
  })
  expect(result4).toEqual(result1)
})

test('params', async () => {
  const result = await pool.any(sql`
    select *
    from test_pgsuite
    where name = any(${sql.array(['one', 'two'], 'text')})
  `)
  expect(result).toEqual([
    {id: 1, name: 'one'},
    {id: 2, name: 'two'},
  ])
})

test('identifier', async () => {
  const result = await pool.oneFirst(sql`
    select count(1)
    from ${sql.identifier(['public', 'test_pgsuite'])}
  `)

  expect(Number(result)).toEqual(3)
})

test('unnest', async () => {
  const entries = [
    {id: 1, name: 'one'},
    {id: 2, name: 'two'},
    {id: 3, name: 'three'},
    {id: 4, name: 'four'},
  ]
  const result = await pool.any(sql`
    insert into test_pgsuite(id, name)
    select *
    from ${sql.unnest(
      entries.map(({id, name}) => [id, name]),
      ['int4', 'text'],
    )}
    returning *
  `)

  expect(result).toEqual([
    {id: 1, name: 'one'},
    {id: 2, name: 'two'},
    {id: 3, name: 'three'},
    {id: 4, name: 'four'},
  ])
})

test('join fragments', async () => {
  const [result] = await pool.any(sql`
    update test_pgsuite
    set ${sql.join([sql`name = 'one hundred'`, sql`id = 100`], sql`, `)}
    where id = 1
    returning *
  `)

  expect(result).toEqual({id: 100, name: 'one hundred'})
})

test('fragment', async () => {
  const condition = sql.fragment`id = 1`

  const result = await pool.one(sql`select * from test_pgsuite where ${condition}`)
  expect(result).toEqual({id: 1, name: 'one'})
})

test('interval', async () => {
  const result = await pool.oneFirst(sql`
    select '2000-01-01T12:00:00Z'::timestamptz + ${sql.interval({
      days: 1,
      hours: 1,
    })} as ts
  `)
  // expect(result).toBeInstanceOf(Date)
  expect(new Date(result as string)).toMatchInlineSnapshot(`2000-01-02T13:00:00.000Z`)

  const interval = await pool.oneFirst(sql`select ${sql.interval({days: 1})}`)
  expect(interval).toMatchInlineSnapshot(`"1 day"`)
})

test('binary', async () => {
  const result = await pool.oneFirst(sql`
    select ${sql.binary(Buffer.from('hello'))} as b
  `)
  expect(result).toMatchInlineSnapshot(`"\\x68656c6c6f"`)
})

test('json', async () => {
  await pool.query(sql`
    drop table if exists jsonb_test;
    create table jsonb_test (id int, data jsonb);
  `)

  const insert = await pool.one(sql`
    insert into jsonb_test values (1, ${sql.json({foo: 'bar'})})
    returning *
  `)

  expect(insert).toEqual({data: {foo: 'bar'}, id: 1})

  const insert3 = await pool.one(sql`
    insert into jsonb_test values (1, ${JSON.stringify({foo: 'bar'})})
    returning *
  `)

  expect(insert3).toEqual(insert)
})

test('jsonb', async () => {
  const insert2 = await pool.one(sql`
    insert into jsonb_test values (1, ${sql.jsonb({foo: 'bar'})})
    returning *
  `)

  expect(insert2).toEqual(insert2)
})

test('literalValue', async () => {
  const result = await pool.transaction(async tx => {
    await tx.query(sql`set local search_path to ${sql.literalValue('abc')}`)
    return tx.one(sql`show search_path`)
  })

  expect(result).toEqual({search_path: 'abc'})
  const result2 = await pool.one(sql`show search_path`)
  expect(result2).toEqual({search_path: '"$user", public'})
})

test('type parsers', async () => {
  const result = await pool.one(sql`
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
      array(select id from test_pgsuite) as arr2,
      '2000-01-01T12:00:00Z'::timestamptz as timestamptz,
      '2000-01-01T12:00:00Z'::timestamp as timestamp,
      '2000-01-01T12:00:00Z'::date as date,
      (select count(*) from test_pgsuite where id = -1) as count
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

test('sub-transactions', async () => {
  const result = await pool.transaction(async t1 => {
    const count1 = await t1.oneFirst(sql`select count(1) from test_pgsuite where id > 3`)
    const count2 = await t1.transaction(async t2 => {
      await t2.query(sql`insert into test_pgsuite(id, name) values (5, 'five')`)
      return t2.oneFirst(sql`select count(1) from test_pgsuite where id > 3`)
    })
    return {count1, count2}
  })

  expect(result).toEqual({count1: 0, count2: 1})
})

test('query timeout', async () => {
  const lower = 20
  const impatient = createClient(pool.pgp.$cn.toString() + '?shortTimeout', {
    pgpOptions: {
      connect: ({client}) => {
        client.connectionParameters.query_timeout = lower
      },
    },
  })
  const patient = createClient(pool.pgp.$cn.toString() + '?longTimeout', {
    pgpOptions: {
      connect: ({client}) => {
        client.connectionParameters.query_timeout = lower * 3
      },
    },
  })

  const sleepMs = (lower * 2) / 1000
  await expect(impatient.one(sql`select pg_sleep(${sleepMs})`)).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: [Query select_9dcc021]: Query read timeout]`,
  )
  await expect(patient.one(sql`select pg_sleep(${sleepMs})`)).resolves.toMatchObject({
    pg_sleep: expect.anything(),
  })
})

test('sql.type', async () => {
  const Fooish = z.object({foo: z.number()})
  await expect(pool.one(sql.type(Fooish)`select 1 as foo`)).resolves.toMatchInlineSnapshot(`
    {
      "foo": 1,
    }
  `)

  await expect(pool.one(sql.type(Fooish)`select 'hello' as foo`)).rejects.toMatchInlineSnapshot(`
    [Error: [Query select_c2b3cb1]: [
      {
        "code": "invalid_type",
        "expected": "number",
        "received": "string",
        "path": [
          "foo"
        ],
        "message": "Expected number, received string"
      }
    ]]
  `)
})

test('sql.typeAlias', async () => {
  // eslint-disable-next-line mmkal/@typescript-eslint/no-shadow
  const sql = createSqlTag({
    typeAliases: {
      foo: z.object({
        foo: z.string(),
      }),
    },
  })

  const result = await pool.one(sql.typeAlias('foo')`select 'hi' as foo`)
  expectTypeOf(result).toEqualTypeOf<{foo: string}>()
  expect(result).toEqual({foo: 'hi'})

  await expect(pool.one(sql.typeAlias('foo')`select 123 as foo`)).rejects.toMatchInlineSnapshot(`
    [Error: [Query select_1534c96]: [
      {
        "code": "invalid_type",
        "expected": "string",
        "received": "number",
        "path": [
          "foo"
        ],
        "message": "Expected string, received number"
      }
    ]]
  `)
})
