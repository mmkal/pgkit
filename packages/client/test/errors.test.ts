import * as lodash from 'lodash'
import * as path from 'path'
import {beforeAll, expect, test} from 'vitest'
import {QueryError, createPool, sql} from '../src'
import {printPostgresErrorSnapshot} from './snapshots'

expect.addSnapshotSerializer({
  test: (val: any) => val instanceof Error,
  print: (val: any) =>
    printPostgresErrorSnapshot(lodash.pick(val, ['message', 'pg_code', 'pg_code_name', 'cause', 'code'])),
})

const repoRoot = path.resolve(process.cwd(), '../..')

expect.addSnapshotSerializer({
  test: (val: unknown) => typeof val === 'string' && val.includes(repoRoot),
  print: (val: any) =>
    (val as string)
      .replaceAll(repoRoot, '<repo>')
      .replaceAll(/(<repo>.*):\d+:\d+/g, '$1:<line>:<col>')
      .replaceAll(/file:\/\/.*:\d+:\d+/g, '<file>:<line>:<col>')
      .replaceAll(/file:\/\/<repo>.*(node_modules\/.*:<line>:<col>)/g, '.../$1')
      .split('\n')
      .filter(line => !line.includes('(node:') && !line.includes('vitest'))
      .join('\n'),
})

let pool: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/await-thenable
  pool = await createPool('postgresql://postgres:postgres@localhost:5432/postgres')
  await pool.query(sql`DROP TABLE IF EXISTS test_errors`)
  await pool.query(sql`CREATE TABLE test_errors (id int, name text)`)
  await pool.query(sql`INSERT INTO test_errors VALUES (1, 'one'), (2, 'two'), (3, 'three')`)
})

test('one error', async () => {
  await expect(pool.one(sql`select * from test_errors where id > 1`)).rejects.toMatchInlineSnapshot(
    `
    [[Query select-test_errors_36f5f64]: Expected one row]
    {
      "message": "[Query select-test_errors_36f5f64]: Expected one row",
      "cause": {
        "name": "QueryErrorCause",
        "message": "Query error",
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
          ],
          "command": "SELECT",
          "rowCount": 2,
          "fields": [
            {
              "name": "id",
              "tableID": 123456789,
              "columnID": 1,
              "dataTypeID": 123456789,
              "dataTypeSize": 4,
              "dataTypeModifier": -1,
              "format": "text"
            },
            {
              "name": "name",
              "tableID": 123456789,
              "columnID": 2,
              "dataTypeID": 123456789,
              "dataTypeSize": -1,
              "dataTypeModifier": -1,
              "format": "text"
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
    [[Query select-test_errors_36f5f64]: Expected at most one row]
    {
      "message": "[Query select-test_errors_36f5f64]: Expected at most one row",
      "cause": {
        "name": "QueryErrorCause",
        "message": "Query error",
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
          ],
          "command": "SELECT",
          "rowCount": 2,
          "fields": [
            {
              "name": "id",
              "tableID": 123456789,
              "columnID": 1,
              "dataTypeID": 123456789,
              "dataTypeSize": 4,
              "dataTypeModifier": -1,
              "format": "text"
            },
            {
              "name": "name",
              "tableID": 123456789,
              "columnID": 2,
              "dataTypeID": 123456789,
              "dataTypeSize": -1,
              "dataTypeModifier": -1,
              "format": "text"
            }
          ]
        }
      }
    }
  `)
})

test('many error', async () => {
  await expect(pool.many(sql`select * from test_errors where id > 100`)).rejects.toMatchInlineSnapshot(`
    [[Query select-test_errors_34cad85]: Expected at least one row]
    {
      "message": "[Query select-test_errors_34cad85]: Expected at least one row",
      "cause": {
        "name": "QueryErrorCause",
        "message": "Query error",
        "query": {
          "name": "select-test_errors_34cad85",
          "sql": "select * from test_errors where id > 100",
          "token": "sql",
          "values": []
        },
        "result": {
          "rows": [],
          "command": "SELECT",
          "rowCount": 0,
          "fields": [
            {
              "name": "id",
              "tableID": 123456789,
              "columnID": 1,
              "dataTypeID": 123456789,
              "dataTypeSize": 4,
              "dataTypeModifier": -1,
              "format": "text"
            },
            {
              "name": "name",
              "tableID": 123456789,
              "columnID": 2,
              "dataTypeID": 123456789,
              "dataTypeSize": -1,
              "dataTypeModifier": -1,
              "format": "text"
            }
          ]
        }
      }
    }
  `)
})

test('syntax error', async () => {
  await expect(pool.query(sql`select * frooom test_errors`)).rejects.toMatchInlineSnapshot(`
    [[Query select_fb83277]: syntax error at or near "frooom"]
    {
      "message": "[Query select_fb83277]: syntax error at or near \\"frooom\\"",
      "cause": {
        "name": "QueryErrorCause",
        "message": "syntax error at or near \\"frooom\\"",
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
          "line": "123456789",
          "routine": "scanner_yyerror",
          "query": "select * frooom test_errors"
        }
      }
    }
  `)

  const err: Error = await pool.query(sql`select * frooom test_errors`).catch(e => e)

  expect(err.stack).toMatchInlineSnapshot(`
    Error: [Query select_fb83277]: syntax error at or near "frooom"
        at Object.query (<repo>/packages/client/src/client.ts:<line>:<col>)
        at <repo>/packages/client/test/errors.test.ts:<line>:<col>
  `)

  expect((err as QueryError).cause?.error?.stack).toMatchInlineSnapshot(`
    error: syntax error at or near "frooom"
        at Parser.parseErrorMessage (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/parser.ts:<line>:<col>)
        at Parser.handlePacket (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/parser.ts:<line>:<col>)
        at Parser.parse (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/parser.ts:<line>:<col>)
        at Socket.<anonymous> (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/index.ts:<line>:<col>)
  `)
})
