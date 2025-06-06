import {beforeAll, beforeEach, expect, test} from 'vitest'
import {createClient, sql} from '../src'

export let client: Awaited<ReturnType<typeof createClient>>

beforeAll(async () => {
  client = createClient('postgresql://postgres:postgres@localhost:5432/postgres')
})

beforeEach(async () => {
  await client.query(sql`
    drop table if exists edge_cases_test;
    create table edge_cases_test(id int unique, name text);
    insert into edge_cases_test values (1, 'one'), (2, 'two'), (3, 'three');
  `)
})

test('sql.array with jsonb', async () => {
  await client.query(sql`
    drop table if exists jsonb_array_test;
    create table jsonb_array_test(id int, jsons jsonb[]);
  `)

  const values = [{n: 'one'}, {n: 'two'}, {n: 'three'}]

  const result = await client.any(sql`
    insert into jsonb_array_test
    values (1, ${sql.array(
      values.map(v => JSON.stringify(v)),
      'jsonb',
    )})
    returning *
  `)

  expect(result).toEqual([{id: 1, jsons: [{n: 'one'}, {n: 'two'}, {n: 'three'}]}])
})

test('empty sql.array', async () => {
  // this wasn't a bug but I thought it might be at one point
  await client.query(sql`
    drop table if exists jsonb_array_test;
    create table jsonb_array_test(id int, jsons jsonb[]);
  `)

  const values = [{n: 'one'}, {n: 'two'}, {n: 'three'}]

  await client.any(sql`
    insert into jsonb_array_test
    values (1, ${sql.array(
      values.map(v => JSON.stringify(v)),
      'jsonb',
    )})
    returning *
  `)

  const result = await client.any(sql`
    select * from jsonb_array_test
    where id = any(${sql.array([], 'int8')})
  `)

  expect(result).toEqual([])
})

test('nested parameterized `sql` tag', async () => {
  const complexQuery = sql`
    insert into edge_cases_test values (4, ${'four'})
    ${sql`on conflict (id) do update set name = ${'four!'}`}
    returning *
  `

  expect(complexQuery).toMatchInlineSnapshot(`
    {
      "name": "insert_e99c9be",
      "parse": [Function],
      "segments": [Function],
      "sql": "
        insert into edge_cases_test values (4, $1)
        on conflict (id) do update set name = $2
        returning *
      ",
      "templateArgs": [Function],
      "then": [Function],
      "token": "sql",
      "values": [
        "four",
        "four!",
      ],
    }
  `)
  // `set name = $1` was a bug in the original implementation
  // it was because $1 was the position in the inner sql tag, but it should have been incremented based on the number of prior values in the outer tag
  expect(complexQuery.sql).not.toContain('set name = $1')

  const result1 = await client.any(complexQuery)

  expect(result1).toEqual([{id: 4, name: 'four'}])

  const result2 = await client.any(complexQuery)

  expect(result2).toEqual([{id: 4, name: 'four!'}])
})

test('nested parameterized `sql.fragment` tag', async () => {
  const complexQuery = sql`
    insert into edge_cases_test values (4, ${'four'})
    ${sql.fragment`on conflict (id) do update set name = ${'four!'}`}
    returning *
  `

  expect(complexQuery).toMatchInlineSnapshot(`
    {
      "name": "insert_e99c9be",
      "parse": [Function],
      "segments": [Function],
      "sql": "
        insert into edge_cases_test values (4, $1)
        on conflict (id) do update set name = $2
        returning *
      ",
      "templateArgs": [Function],
      "then": [Function],
      "token": "sql",
      "values": [
        "four",
        "four!",
      ],
    }
  `)
  // `set name = $1` was a bug in the original implementation
  // it was because $1 was the position in the inner sql tag, but it should have been incremented based on the number of prior values in the outer tag
  expect(complexQuery.sql).not.toContain('set name = $1')

  const result1 = await client.any(complexQuery)

  expect(result1).toEqual([{id: 4, name: 'four'}])

  const result2 = await client.any(complexQuery)

  expect(result2).toEqual([{id: 4, name: 'four!'}])
})

test('join param', async () => {
  const parts = [sql`id = ${11}`, sql`name = ${'eleven'}`]
  const query = sql`
    update edge_cases_test
    set ${sql.join(parts, sql`, `)}
    where id = ${1}
  `
  expect(query).toMatchInlineSnapshot(`
    {
      "name": "update_9990569",
      "parse": [Function],
      "segments": [Function],
      "sql": "
        update edge_cases_test
        set id = $1, name = $2
        where id = $3
      ",
      "templateArgs": [Function],
      "then": [Function],
      "token": "sql",
      "values": [
        11,
        "eleven",
        1,
      ],
    }
  `)
  await client.query(query)
  const result = await client.any(sql`select * from edge_cases_test where id = ${11}`)
  expect(result).toEqual([{id: 11, name: 'eleven'}])
})
test('mixed join param', async () => {
  const parts = [sql`${1} as one`, 2, sql`3 as three`]

  const query = sql`
    select ${sql.join(parts, sql`, `)}
  `

  expect(query).toMatchInlineSnapshot(`
    {
      "name": "select_16400f2",
      "parse": [Function],
      "segments": [Function],
      "sql": "
        select $1 as one, $2, 3 as three
      ",
      "templateArgs": [Function],
      "then": [Function],
      "token": "sql",
      "values": [
        1,
        2,
      ],
    }
  `)
  const result = await client.any(query)
  expect(result).toEqual([{one: 1, '?column?': 2, three: 3}])
})
