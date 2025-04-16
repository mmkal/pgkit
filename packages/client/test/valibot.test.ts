import * as v from 'valibot'
import {beforeAll, beforeEach, expect, test} from 'vitest'
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
    drop table if exists valibot_test;
    create table valibot_test(id int, location text, label text);
    insert into valibot_test values (1, '70,-108', 'a'), (2, '71,-102', 'b'), (3, '66,-90', null);
  `)
})

test('simple schemas', async () => {
  const GoodRow = v.object({id: v.number(), label: v.nullable(v.string())})
  const BadRow = v.object({id: v.number(), label: v.pipe(v.string(), v.regex(/a crazy regex/))})

  await expect(
    client.any(sql.type(GoodRow)`
      select id, label from valibot_test
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
      select id, label from valibot_test
    `),
  ).rejects.toMatchInlineSnapshot(`
    {
      "message": "[select-valibot_test_7b8a19d]: Parsing rows failed",
      "query": {
        "name": "select-valibot_test_7b8a19d",
        "sql": "\\n      select id, label from valibot_test\\n    ",
        "token": "sql",
        "values": []
      },
      "cause": {
        "message": "Validation failed:\\n\\n.label: Invalid format: Expected /a crazy regex/ but received \\"a\\"",
        "issues": [
          {
            "kind": "validation",
            "type": "regex",
            "input": "a",
            "expected": "/a crazy regex/",
            "received": "\\"a\\"",
            "message": "Invalid format: Expected /a crazy regex/ but received \\"a\\"",
            "requirement": {},
            "path": [
              {
                "type": "object",
                "origin": "value",
                "input": {
                  "id": 1,
                  "label": "a"
                },
                "key": "label",
                "value": "a"
              }
            ]
          }
        ]
      }
    }
  `)
})
