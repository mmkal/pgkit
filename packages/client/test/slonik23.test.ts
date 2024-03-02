import {createPool, sql} from 'slonik23'
import {beforeAll, beforeEach, expect, test} from 'vitest'

let pool: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  pool = createPool('postgresql://postgres:postgres@localhost:5432/postgres')
})

// codegen:start {preset: custom, source: ./generate.ts, export: generate, dev: true, removeTests: [interval, jsonb, literalValue, fragment, type parsers]}
beforeEach(async () => {
  await pool.query(sql`DROP TABLE IF EXISTS test_slonik23`)
  await pool.query(sql`CREATE TABLE test_slonik23 (id int, name text)`)
  await pool.query(sql`INSERT INTO test_slonik23 VALUES (1, 'one'), (2, 'two'), (3, 'three')`)
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
    from test_slonik23
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
    from ${sql.identifier(['public', 'test_slonik23'])}
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
    insert into test_slonik23(id, name)
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
    update test_slonik23
    set ${sql.join([sql`name = 'one hundred'`, sql`id = 100`], sql`, `)}
    where id = 1
    returning *
  `)

  expect(result).toEqual({id: 100, name: 'one hundred'})
})

test('binary', async () => {
  const result = await pool.oneFirst(sql`
    select ${sql.binary(Buffer.from('hello'))} as b
  `)
  expect(result).toMatchSnapshot()
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

test('sub-transactions', async () => {
  const result = await pool.transaction(async t1 => {
    const count1 = await t1.oneFirst(sql`select count(1) from test_slonik23 where id > 3`)
    const count2 = await t1.transaction(async t2 => {
      await t2.query(sql`insert into test_slonik23(id, name) values (5, 'five')`)
      return t2.oneFirst(sql`select count(1) from test_slonik23 where id > 3`)
    })
    return {count1, count2}
  })

  expect(result).toEqual({count1: 0, count2: 1})
})
// codegen:end

test('type parsers', async () => {
  const result = await pool.one(sql`
    select
      '1 day'::interval as day_interval,
      '1 hour'::interval as hour_interval,
      '2000-01-01T12:00:00Z'::timestamptz as timestamptz,
      '2000-01-01T12:00:00Z'::timestamp as timestamp,
      '2000-01-01T12:00:00Z'::date as date,
      (select count(*) from test_slonik23 where id = -1) as count
  `)

  expect(result).toMatchInlineSnapshot(`
    {
      "count": 0,
      "date": "2000-01-01",
      "day_interval": 86400,
      "hour_interval": 3600,
      "timestamp": 946746000000,
      "timestamptz": 946728000000,
    }
  `)
})
