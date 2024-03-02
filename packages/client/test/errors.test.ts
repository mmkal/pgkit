import * as lodash from 'lodash'
import * as path from 'path'
import {beforeAll, expect, test} from 'vitest'
import {QueryError, createPool, sql} from '../src'

expect.addSnapshotSerializer({
  test: (val: any) => val instanceof Error,
  print: (val: any) =>
    JSON.stringify(lodash.pick(val, ['message', 'pg_code', 'pg_code_name', 'cause', 'code']), null, 2),
})

const repoRoot = path.resolve(process.cwd(), '../..')

expect.addSnapshotSerializer({
  test: (val: unknown) => typeof val === 'string' && val.includes(repoRoot),
  print: (val: any) =>
    (val as string)
      .replaceAll(repoRoot, '<repo>')
      .replaceAll(/file:\/\/.*:\d+:\d+/g, '<file>:<line>:<col>')
      .split('\n')
      .filter(line => !line.includes('(node:'))
      .join('\n'),
})

let pool: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  // eslint-disable-next-line mmkal/@typescript-eslint/await-thenable
  pool = await createPool('postgresql://postgres:postgres@localhost:5432/postgres')
  await pool.query(sql`DROP TABLE IF EXISTS test_errors`)
  await pool.query(sql`CREATE TABLE test_errors (id int, name text)`)
  await pool.query(sql`INSERT INTO test_errors VALUES (1, 'one'), (2, 'two'), (3, 'three')`)
})

test('one error', async () => {
  await expect(pool.one(sql`select * from test_errors where id > 1`)).rejects.toMatchInlineSnapshot(
    `
      {
        "message": "[Query select-test_errors_36f5f64]: Expected one row",
        "cause": {
          "query": {
            "name": "select-test_errors_36f5f64",
            "sql": "select * from test_errors where id > 1",
            "token": "sql",
            "values": []
          },
          "result": {
            "rows": [
              {
                "id": 2,
                "name": "two"
              },
              {
                "id": 3,
                "name": "three"
              }
            ]
          }
        }
      }
    `,
  )
})

test('maybeOne error', async () => {
  await expect(pool.maybeOne(sql`select * from test_errors where id > 1`)).rejects.toMatchInlineSnapshot(`
    {
      "message": "[Query select-test_errors_36f5f64]: Expected at most one row",
      "cause": {
        "query": {
          "name": "select-test_errors_36f5f64",
          "sql": "select * from test_errors where id > 1",
          "token": "sql",
          "values": []
        },
        "result": {
          "rows": [
            {
              "id": 2,
              "name": "two"
            },
            {
              "id": 3,
              "name": "three"
            }
          ]
        }
      }
    }
  `)
})

test('many error', async () => {
  await expect(pool.many(sql`select * from test_errors where id > 100`)).rejects.toMatchInlineSnapshot(`
    {
      "message": "[Query select-test_errors_34cad85]: Expected at least one row",
      "cause": {
        "query": {
          "name": "select-test_errors_34cad85",
          "sql": "select * from test_errors where id > 100",
          "token": "sql",
          "values": []
        },
        "result": {
          "rows": []
        }
      }
    }
  `)
})

test('syntax error', async () => {
  await expect(pool.query(sql`select * frooom test_errors`)).rejects.toMatchInlineSnapshot(`
    {
      "message": "[Query select_fb83277]: syntax error at or near \\"frooom\\"",
      "pg_code": "42601",
      "pg_code_name": "syntax_error",
      "cause": {
        "query": {
          "name": "select_fb83277",
          "sql": "select * frooom test_errors",
          "token": "sql",
          "values": []
        },
        "error": {
          "length": 95,
          "name": "error",
          "severity": "ERROR",
          "code": "42601",
          "position": "10",
          "file": "scan.l",
          "line": "1145",
          "routine": "scanner_yyerror",
          "query": "select * frooom test_errors"
        }
      }
    }
  `)

  const err: Error = await pool.query(sql`select * frooom test_errors`).catch(e => e)

  expect(err.stack).toMatchInlineSnapshot(`
    Error: [Query select_fb83277]: syntax error at or near "frooom"
        at Object.query (<repo>/packages/client/src/index.ts:375:13)
        at <repo>/packages/client/test/errors.test.ts:140:22
        at runTest (<file>:<line>:<col>)
        at runSuite (<file>:<line>:<col>)
        at runFiles (<file>:<line>:<col>)
        at startTests (<file>:<line>:<col>)
        at <file>:<line>:<col>
        at withEnv (<file>:<line>:<col>)
        at run (<file>:<line>:<col>)
  `)

  expect((err as QueryError).cause?.error?.stack).toMatchInlineSnapshot(`
    error: syntax error at or near "frooom"
        at Parser.parseErrorMessage (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/parser.ts:369:69)
        at Parser.handlePacket (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/parser.ts:188:21)
        at Parser.parse (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/parser.ts:103:30)
        at Socket.<anonymous> (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/index.ts:7:48)
  `)
})
