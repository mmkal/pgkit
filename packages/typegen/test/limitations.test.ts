import * as fsSyncer from 'fs-syncer'
import {test, beforeEach, expect, vi as jest} from 'vitest'

import * as typegen from '../src'
import {getPureHelper as getHelper} from './helper'

import './register-mock-serializer'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  jest.resetAllMocks()

  await helper.setupDb()
  await helper.pool.query(helper.sql`
    create table test_table(
      id int primary key,
      n int
    );
  `)
})

test(`multi statements don't get types`, async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`
          insert into test_table(id, n) values (1, 2);
          insert into test_table(id, n) values (3, 4);
        \`
      `,
      'test.sql': `
        drop table test_table;
        -- make sure multi statements in .sql files are handled properly
        select now();
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(logger.error).not.toHaveBeenCalled()

  await expect(helper.pool.one(helper.sql`select count(*) from test_table`)).resolves.toEqual({count: 0})

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from '@pgkit/client'

      export default sql\`
        insert into test_table(id, n) values (1, 2);
        insert into test_table(id, n) values (3, 4);
      \`

    test.sql: |-
      drop table test_table;
      -- make sure multi statements in .sql files are handled properly
      select now();
    "
  `)
})

test('variable table name', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        const tableName = 'test_table'

        export default sql\`select * from \${sql.identifier([tableName])}\`
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(logger.error).not.toHaveBeenCalled()
  expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/.*index.ts:\d+ \[!] Query is not typeable./))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from '@pgkit/client'

      const tableName = 'test_table'

      export default sql\`select * from \${sql.identifier([tableName])}\`
    "
  `)
})

test('duplicate columns', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`select 1 as a, 'two' as a\`
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from '@pgkit/client'

      export default sql<queries.A_a>\`select 1 as a, 'two' as a\`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select 1 as a, 'two' as a\` */
        export interface A_a {
          /**
           * Warning: 2 columns detected for field a!
           *
           * regtype: \`integer\`
           *
           * regtype: \`text\`
           */
          a: (number | null) | (string | null)
        }
      }
    "
  `)
})

test('void queries', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default [
          sql\`update test_table set n = 0\`,
          sql\`insert into test_table values (0, 0)\`,
          sql\`create table x (y int)\`,
        ]
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from '@pgkit/client'

      export default [
        sql\`update test_table set n = 0\`,
        sql<queries._void>\`insert into test_table values (0, 0)\`,
        sql\`create table x (y int)\`,
      ]

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`insert into test_table values (0, 0)\` */
        export type _void = {}
      }
    "
  `)
})

test('simple', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`
          select 1 as a, 'two' as b
        \`
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(logger.warn).not.toHaveBeenCalled()
  expect(logger.error).not.toHaveBeenCalled()

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from '@pgkit/client'

      export default sql<queries.A_b>\`
        select 1 as a, 'two' as b
      \`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select 1 as a, 'two' as b\` */
        export interface A_b {
          /** regtype: \`integer\` */
          a: number | null

          /** regtype: \`text\` */
          b: string | null
        }
      }
    "
  `)
})

test('queries with comments are modified', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`
          select
            1 as a, -- comment
            -- comment
            2 as b,
            '--' as c, -- comment
            id
          from
            -- comment
            test_table -- comment
        \`
      `,
    },
  })

  syncer.sync()
  const before = syncer.read()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(logger.warn).toHaveBeenCalled()
  expect(logger.warn).toMatchInlineSnapshot(`
    - - >
        Error:
        ./test/fixtures/limitations.test.ts/queries-with-comments-are-modified/index.ts:3
        [!] Extracting types from query failed. Try moving comments to dedicated
        lines.
          Caused by: Error: psql failed
            Caused by: Error: Error running psql query "psql:<stdin>:1: ERROR:  syntax error at end of input\\nLINE 1: select 1 as a, \\n                       ^"
              Caused by: AssertionError [ERR_ASSERTION]: Empty output received
  `)

  expect(syncer.read()).toEqual(before) // no update expected
})

test('queries with complex CTEs and comments fail with helpful warning', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`
          with abc as (
            select table_name -- comment
            from information_schema.tables
          ),
          def as (
            select table_schema
            from information_schema.tables, abc
          )
          select * from def
        \`
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(logger.warn).toHaveBeenCalled()
  expect(logger.warn).toMatchInlineSnapshot(`
    - - >
        Error:
        ./test/fixtures/limitations.test.ts/queries-with-complex-ctes-and-comments-fail-with-helpful-warning/index.ts:3
        [!] Extracting types from query failed. Try moving comments to dedicated
        lines.
          Caused by: Error: psql failed
            Caused by: Error: Error running psql query "psql:<stdin>:1: ERROR:  syntax error at end of input\\nLINE 1: with abc as ( select table_name \\n                                        ^"
              Caused by: AssertionError [ERR_ASSERTION]: Empty output received
  `)
})

test('queries with semicolons are rejected', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export const trailingSemicolon = sql\`select * from test_table;\`
        export const trailingSemicolonWithComment = sql\`update semicolon_query_table2 set col=2 returning 1; -- I love semicolons\`
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  // running typegen should not have executed the `create table` statement!!!!
  expect(
    await helper.pool.any(
      helper.sql`select table_schema, table_name from information_schema.tables where table_name like 'semicolon_query_table%'`,
    ),
  ).toEqual([])

  expect(logger.warn).toMatchInlineSnapshot(`
    - - >
        Error:
        ./test/fixtures/limitations.test.ts/queries-with-semicolons-are-rejected/index.ts:4
        [!] Query is not typeable.
          Caused by: Error: Contains semicolon
            Caused by: update semicolon_query_table2 set col=2 returning 1; -- I love semicolons
  `)
})
