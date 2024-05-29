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

test('conditional nested `sql` tag', async () => {
  const complexQuery = sql`
    insert into edge_cases_test values (4, ${'four'})
    ${
      Math.random() >= 0
        ? sql`on conflict (id) do update set name = ${'four!'}` //
        : sql``
    }
    returning *
  `

  expect(complexQuery).toMatchInlineSnapshot(`
    {
      "name": "insert_e99c9be",
      "parse": [Function],
      "sql": "
        insert into edge_cases_test values (4, $1)
        on conflict (id) do update set name = $2
        returning *
      ",
      "templateArgs": [Function],
      "token": "sql",
      "values": [
        "four",
        "four!",
      ],
    }
  `)
  // `set name = $1` was a bug in the original implementation
  // it was because $1 was the position in the inner sql tag, but it should have been incremented based on the number of prior values in the outer tag
  //   expect(complexQuery.sql).not.toContain('set name = $1')

  const result1 = await client.any(complexQuery)

  expect(result1).toEqual([{id: 4, name: 'four'}])

  const result2 = await client.any(complexQuery)

  expect(result2).toEqual([{id: 4, name: 'four!'}])
})
