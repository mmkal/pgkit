import {type} from 'arktype'
import {beforeAll, beforeEach, expect, expectTypeOf, test} from 'vitest'
import {createClient, sql} from '../src'

export let client: Awaited<ReturnType<typeof createClient>>

expect.addSnapshotSerializer({
  test: () => true,
  print: (val: any) => JSON.stringify(val, null, 2),
})

beforeAll(async () => {
  client = createClient('postgresql://postgres:postgres@localhost:5432/postgres')
})

beforeEach(async () => {
  await client.query(sql`
    drop table if exists arktype_test;
    create table arktype_test(id int, location text, label text);
    insert into arktype_test values (1, '70,-108', 'a'), (2, '71,-102', 'b'), (3, '66,-90', null);
  `)
})

test('simple schemas', async () => {
  const GoodRow = type({id: 'number', label: 'string | null'})
  const BadRow = type({id: 'number', label: '/a/'})

  await expect(
    client.any(sql.type(GoodRow)`
      select id, label from arktype_test
    `),
  ).resolves.toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "label": "a"
      },
      {
        "id": 2,
        "label": "b"
      },
      {
        "id": 3,
        "label": null
      }
    ]
  `)

  await expect(
    client.any(sql.type(BadRow)`
      select id, label from arktype_test
    `),
  ).rejects.toMatchInlineSnapshot(`
    {
      "message": "[select-arktype_test_46f036f]: Parsing rows failed",
      "query": {
        "name": "select-arktype_test_46f036f",
        "sql": "\\n      select id, label from arktype_test\\n    ",
        "token": "sql",
        "values": []
      },
      "cause": {
        "message": "Validation failed:\\n\\n.label: label must be matched by a (was \\"b\\")",
        "issues": [
          {
            "data": "b",
            "path": [
              "label"
            ],
            "code": "pattern",
            "description": "matched by a",
            "meta": {},
            "rule": "a",
            "expected": "matched by a",
            "actual": "\\"b\\"",
            "problem": "must be matched by a (was \\"b\\")",
            "message": "label must be matched by a (was \\"b\\")"
          }
        ]
      }
    }
  `)
})
