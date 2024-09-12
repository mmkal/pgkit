import {beforeAll, beforeEach, expect, expectTypeOf, test} from 'vitest'
import {z} from 'zod'
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
    drop table if exists zod_test;
    create table zod_test(id int, location text, label text);
    insert into zod_test values (1, '70,-108', 'a'), (2, '71,-102', 'b'), (3, '66,-90', null);
  `)
})

test('Transform rows', async () => {
  const Row = z.object({
    id: z.number(),
    label: z.string().nullable(),
    location: z
      .string()
      .regex(/^-?\d+,-?\d+$/)
      .transform(s => {
        const [lat, lon] = s.split(',')
        return {lat: Number(lat), lon: Number(lon)}
      }),
  })

  const result = await client.any(sql.type(Row)`
    select * from zod_test
  `)

  expectTypeOf(result).toEqualTypeOf<{id: number; label: string | null; location: {lat: number; lon: number}}[]>()

  const result2 = await client.any(sql.type(Row)`
    select * from ${sql.identifier(['zod_test'])}
  `)

  expect(result2).toEqual(result)

  expect(result).toMatchInlineSnapshot(`
    [
      {
        "id": 1,
        "label": "a",
        "location": {
          "lat": 70,
          "lon": -108
        }
      },
      {
        "id": 2,
        "label": "b",
        "location": {
          "lat": 71,
          "lon": -102
        }
      },
      {
        "id": 3,
        "label": null,
        "location": {
          "lat": 66,
          "lon": -90
        }
      }
    ]
  `)
})

test('Refine schemas', async () => {
  const Row = z.object({
    id: z.number().refine(n => n % 2 === 0, {message: 'id must be even'}),
    name: z.string(),
  })

  const getResult = () =>
    client.any(sql.type(Row)`
      select * from zod_test
    `)

  await expect(getResult()).rejects.toMatchInlineSnapshot(`
    {
      "cause": {
        "query": {
          "name": "select-zod_test_83bbed1",
          "sql": "\\n      select * from zod_test\\n    ",
          "token": "sql",
          "values": []
        },
        "error": {
          "issues": [
            {
              "code": "invalid_type",
              "expected": "string",
              "received": "undefined",
              "path": [
                "name"
              ],
              "message": "Required"
            },
            {
              "code": "custom",
              "message": "id must be even",
              "path": [
                "id"
              ]
            }
          ],
          "name": "ZodError"
        },
        "message": "[\\n  {\\n    \\"code\\": \\"invalid_type\\",\\n    \\"expected\\": \\"string\\",\\n    \\"received\\": \\"undefined\\",\\n    \\"path\\": [\\n      \\"name\\"\\n    ],\\n    \\"message\\": \\"Required\\"\\n  },\\n  {\\n    \\"code\\": \\"custom\\",\\n    \\"message\\": \\"id must be even\\",\\n    \\"path\\": [\\n      \\"id\\"\\n    ]\\n  }\\n]",
        "name": "QueryErrorCause"
      }
    }
  `)
})
