import {test, expect} from 'vitest'
import {z} from 'zod'
import {zreflect} from '@/client/utils/zform'
import {commonPrefix} from '@/client/views/file-tree'

expect.addSnapshotSerializer({
  test: val => val instanceof z.ZodType,
  print: (val: any) => val.constructor.name,
})

test('commonPrefix', async () => {
  expect(
    commonPrefix([
      '/Users/mmkal/src/pgkit/packages/admin/zignoreme/migrator/migrations/2024.04.25T03.55.50.patients.sql',
      '/Users/mmkal/src/pgkit/packages/admin/zignoreme/migrator/migrations/down/2024.04.25T03.55.50.patients.sql',
    ]),
  ).toMatchInlineSnapshot(`"/Users/mmkal/src/pgkit/packages/admin/zignoreme/migrator/migrations/"`)
})

test('zreflect', async () => {
  const TestSchema = z.object({
    s: z.string(),
    n: z.number().optional(),
    b: z.boolean().transform(b => b.toString().split('e')),
    o: z.object({
      os: z.string().nullable(),
      on: z.number().nullish(),
      ob: z.boolean(),
      oo: z.object({
        oos: z.string().regex(/x/),
        oon: z.number(),
        oob: z.boolean(),
      }),
    }),
  })

  expect(zreflect(TestSchema)).toMatchInlineSnapshot(`
    [
      {
        "children": [
          {
            "mods": [],
            "path": [
              "s",
            ],
            "type": "string",
          },
          {
            "mods": [
              {
                "original": ZodOptional,
                "type": ".unwrap()",
              },
            ],
            "path": [
              "n",
            ],
            "type": "number",
          },
          {
            "mods": [
              {
                "original": ZodEffects,
                "type": "_def.schema",
              },
            ],
            "path": [
              "b",
            ],
            "type": "boolean",
          },
          {
            "children": [
              {
                "mods": [
                  {
                    "original": ZodNullable,
                    "type": ".unwrap()",
                  },
                ],
                "path": [
                  "o",
                  "os",
                ],
                "type": "string",
              },
              {
                "mods": [
                  {
                    "original": ZodOptional,
                    "type": ".unwrap()",
                  },
                  {
                    "original": ZodNullable,
                    "type": ".unwrap()",
                  },
                ],
                "path": [
                  "o",
                  "on",
                ],
                "type": "number",
              },
              {
                "mods": [],
                "path": [
                  "o",
                  "ob",
                ],
                "type": "boolean",
              },
              {
                "children": [
                  {
                    "mods": [],
                    "path": [
                      "o",
                      "oo",
                      "oos",
                    ],
                    "type": "string",
                  },
                  {
                    "mods": [],
                    "path": [
                      "o",
                      "oo",
                      "oon",
                    ],
                    "type": "number",
                  },
                  {
                    "mods": [],
                    "path": [
                      "o",
                      "oo",
                      "oob",
                    ],
                    "type": "boolean",
                  },
                ],
                "mods": [],
                "path": [
                  "o",
                  "oo",
                ],
                "type": "object",
              },
            ],
            "mods": [],
            "path": [
              "o",
            ],
            "type": "object",
          },
        ],
        "mods": [],
        "path": [],
        "type": "object",
      },
    ]
  `)
})
