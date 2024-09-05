import * as fsSyncer from 'fs-syncer'
import {test, beforeEach, expect, vi as jest} from 'vitest'
import * as typegen from '../src'
import {getPureHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getPureHelper({__filename})

beforeEach(async () => {
  jest.resetAllMocks()

  await helper.setupDb()
  await helper.pool.query(helper.sql`
    create table test_table1(a int not null);
    create table test_table2(b double precision);
  `)
})

test('statement avoiding CTE', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`
          select * from test_table1 t1
          join test_table2 t2 on t1.a = t2.b
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
      import {sql} from 'slonik'

      export default sql<queries.TestTable1_TestTable2>\`
        select * from test_table1 t1
        join test_table2 t2 on t1.a = t2.b
      \`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select * from test_table1 t1 join test_table2 t2 on t1.a = t2.b\` */
        export interface TestTable1_TestTable2 {
          /** column: \`public.test_table1.a\`, not null: \`true\`, regtype: \`integer\` */
          a: number

          /** column: \`public.test_table2.b\`, regtype: \`double precision\` */
          b: number | null
        }
      }
    "
  `)
})

test(`statement with CTE`, async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`
          with abc as (select a as aaa from test_table1),
          def as (select b as bbb from test_table2)
          select aaa, bbb from abc join def on abc.aaa = def.bbb
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
      import {sql} from 'slonik'

      export default sql<queries.Abc_Def>\`
        with abc as (select a as aaa from test_table1),
        def as (select b as bbb from test_table2)
        select aaa, bbb from abc join def on abc.aaa = def.bbb
      \`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`with abc as (select a as aaa from test_t... [truncated] ...b from abc join def on abc.aaa = def.bbb\` */
        export interface Abc_Def {
          /** column: \`abc.aaa\`, not null: \`true\`, regtype: \`integer\` */
          aaa: number

          /** column: \`def.bbb\`, regtype: \`double precision\` */
          bbb: number | null
        }
      }
    "
  `)
})

test(`statement with complex CTE`, async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`
          with abc as (select table_name from information_schema.tables),
          def as (select table_schema from information_schema.tables, abc)
          select * from def
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
      import {sql} from 'slonik'

      export default sql<queries.Def>\`
        with abc as (select table_name from information_schema.tables),
        def as (select table_schema from information_schema.tables, abc)
        select * from def
      \`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`with abc as (select table_name from info... [truncated] ...on_schema.tables, abc) select * from def\` */
        export interface Def {
          /** column: \`def.table_schema\`, regtype: \`name\` */
          table_schema: string | null
        }
      }
    "
  `)
})

test(`statement with confusingly-named CTE`, async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`
          with test_table1 as (select b as a from test_table2)
          select a from test_table1
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
      import {sql} from 'slonik'

      export default sql<queries.TestTable1>\`
        with test_table1 as (select b as a from test_table2)
        select a from test_table1
      \`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`with test_table1 as (select b as a from test_table2) select a from test_table1\` */
        export interface TestTable1 {
          /** column: \`test_table1.a\`, regtype: \`double precision\` */
          a: number | null
        }
      }
    "
  `)
})
