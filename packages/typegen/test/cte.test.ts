import * as fsSyncer from 'fs-syncer'
import {test, beforeEach, expect, vi as jest} from 'vitest'
import * as typegen from '../src'
import {getPureHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getPureHelper({__filename})

beforeEach(async () => {
  jest.resetAllMocks()

  await helper.setupDb()
  await helper.pool.query(helper.sql`
    create table test_table1(
      a int not null
    );
    create table test_table2(
      b double precision
    );
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

test(`statement with simple CTE`, async () => {
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
          /**
           * From CTE subquery "abc", column source: public.test_table1.a
           *
           * column: \`✨.abc.aaa\`, not null: \`true\`, regtype: \`integer\`
           */
          aaa: number

          /**
           * From CTE subquery "def", column source: public.test_table2.b
           *
           * column: \`✨.def.bbb\`, regtype: \`double precision\`
           */
          bbb: number | null
        }
      }
    "
  `)
})

test(`statement with CTE with aggregate function`, async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`
          with abc as (select count(*) from test_table1)
          select count as table_size from abc
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

      export default sql<queries.Abc>\`
        with abc as (select count(*) from test_table1)
        select count as table_size from abc
      \`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`with abc as (select count(*) from test_table1) select count as table_size from abc\` */
        export interface Abc {
          /** regtype: \`bigint\` */
          table_size: number | null
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
          /**
           * From CTE subquery "def", column source: information_schema.tables.table_schema
           *
           * column: \`✨.def.table_schema\`, regtype: \`name\`
           */
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
          /**
           * From CTE subquery "test_table1", column source: public.test_table2.b
           *
           * column: \`✨.test_table1.a\`, regtype: \`double precision\`
           */
          a: number | null
        }
      }
    "
  `)
})

test(`statement with CTE with crazy ordering`, async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`
          with x as (
            select
              b as b1,
              a as a1,
              a as a2,
              a as a3,
              b as b2,
              a as a4,
              b as b3
            from test_table2
            join test_table1 on test_table1.a = test_table2.b

          )
          select * from x
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

      export default sql<queries.X>\`
        with x as (
          select
            b as b1,
            a as a1,
            a as a2,
            a as a3,
            b as b2,
            a as a4,
            b as b3
          from test_table2
          join test_table1 on test_table1.a = test_table2.b

        )
        select * from x
      \`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`with x as ( select b as b1, a as a1, a a... [truncated] ...ble1.a = test_table2.b ) select * from x\` */
        export interface X {
          /**
           * From CTE subquery "x", column source: public.test_table2.b
           *
           * column: \`✨.x.b1\`, regtype: \`double precision\`
           */
          b1: number | null

          /**
           * From CTE subquery "x", column source: public.test_table1.a
           *
           * column: \`✨.x.a1\`, not null: \`true\`, regtype: \`integer\`
           */
          a1: number

          /**
           * From CTE subquery "x", column source: public.test_table1.a
           *
           * column: \`✨.x.a2\`, not null: \`true\`, regtype: \`integer\`
           */
          a2: number

          /**
           * From CTE subquery "x", column source: public.test_table1.a
           *
           * column: \`✨.x.a3\`, not null: \`true\`, regtype: \`integer\`
           */
          a3: number

          /**
           * From CTE subquery "x", column source: public.test_table2.b
           *
           * column: \`✨.x.b2\`, regtype: \`double precision\`
           */
          b2: number | null

          /**
           * From CTE subquery "x", column source: public.test_table1.a
           *
           * column: \`✨.x.a4\`, not null: \`true\`, regtype: \`integer\`
           */
          a4: number

          /**
           * From CTE subquery "x", column source: public.test_table2.b
           *
           * column: \`✨.x.b3\`, regtype: \`double precision\`
           */
          b3: number | null
        }
      }
    "
  `)
})
