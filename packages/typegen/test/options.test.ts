import * as fsSyncer from 'fs-syncer'
import * as path from 'path'
import {test, beforeEach, expect, vi as jest} from 'vitest'

import * as typegen from '../src'
import {getPureHelper as getHelper} from './helper'

import './register-mock-serializer'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

// todo: test two tables, where sql parser can't automatically tell which table the columns are from.

beforeEach(async () => {
  jest.resetAllMocks()
  await helper.setupDb()
})

test('write types', async () => {
  await helper.pool.query(helper.sql`
    create type test_enum as enum('aa', 'bb', 'cc');

    create table test_table(
      id int primary key,
      n int,
      t text,
      t_nn text not null,
      cv varchar(1),
      arr text[],
      e test_enum,
      tz timestamptz,
      tz_nn timestamptz not null default now(),
      j json,
      jb jsonb,
      j_nn json not null,
      jb_nn jsonb not null,
      d_p numeric(8),
      d_ps numeric(8, 4)
    );

    comment on column test_table.t is 'Some custom comment on "t"';
  `)

  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default [
          sql\`select * from test_table\`,
          sql\`select id, t from test_table\`,
          sql\`select count(*) from test_table\`,
          sql\`select count(*) from test_table group by id\`,
          sql\`select count(*) as cnt from test_table\`,
          sql\`select coalesce(t, 'fallback') from test_table\`,
          sql\`select coalesce(sum(n), 0) as sum from test_table\`,
          sql\`select id as idalias, t as talias from test_table\`,
          sql\`select id from test_table where id = \${1} and n = \${2}\`,
          sql\`insert into test_table(id, j_nn, jb_nn) values (1, '{}', '{}')\`,
          sql\`update test_table set t = ''\`,
          sql\`insert into test_table(id, t_nn, j_nn, jb_nn) values (1, '', '{}', '{}') returning id, t\`,
          sql\`update test_table set t = '' returning id, t\`,
          sql\`insert into test_table as tt (id, j_nn, jb_nn) values (1, '{}', '{}') returning id, t\`,
          sql\`update test_table as tt set t = '' returning id, t\`,
          sql\`delete from test_table where t = '' returning id, t\`,
          sql\`select pg_advisory_lock(123)\`,
          sql\`select t1.id from test_table t1 join test_table t2 on t1.id = t2.n\`,
          sql\`select jb->'foo'->>'bar' from test_table\`,
          sql\`select n::numeric from test_table\`,
          sql\`select n::text from test_table\`,
          sql\`select * from (values (1, 'one'), (2, 'two')) as vals (num, letter)\`,
          sql\`select t from (select id from test_table) t\`,
          sql\`
            select t as t_aliased1, t_nn as t_nn_aliased
            from test_table as tt1
            where
              t_nn in (
                select t_nn as t_aliased2
                from test_table as tt2
                where n = 1
              )
          \`,
          sql\`select d_p from test_table\`,
          sql\`select d_ps from test_table\`,
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
        sql<queries.TestTable>\`select * from test_table\`,
        sql<queries.TestTable_id_t>\`select id, t from test_table\`,
        sql<queries.TestTable_count>\`select count(*) from test_table\`,
        sql<queries.TestTable_count>\`select count(*) from test_table group by id\`,
        sql<queries.TestTable_cnt>\`select count(*) as cnt from test_table\`,
        sql<queries.TestTable_coalesce>\`select coalesce(t, 'fallback') from test_table\`,
        sql<queries.TestTable_sum>\`select coalesce(sum(n), 0) as sum from test_table\`,
        sql<queries.TestTable_idalias_talias>\`select id as idalias, t as talias from test_table\`,
        sql<queries.TestTable_id>\`select id from test_table where id = \${1} and n = \${2}\`,
        sql<queries._void>\`insert into test_table(id, j_nn, jb_nn) values (1, '{}', '{}')\`,
        sql\`update test_table set t = ''\`,
        sql<queries.TestTable_id_t>\`insert into test_table(id, t_nn, j_nn, jb_nn) values (1, '', '{}', '{}') returning id, t\`,
        sql<queries.TestTable_id_t>\`update test_table set t = '' returning id, t\`,
        sql<queries.TestTable_id_t>\`insert into test_table as tt (id, j_nn, jb_nn) values (1, '{}', '{}') returning id, t\`,
        sql<queries.TestTable_id_t>\`update test_table as tt set t = '' returning id, t\`,
        sql<queries.TestTable_id_t>\`delete from test_table where t = '' returning id, t\`,
        sql<queries.PgAdvisoryLock>\`select pg_advisory_lock(123)\`,
        sql<queries.TestTable_id>\`select t1.id from test_table t1 join test_table t2 on t1.id = t2.n\`,
        sql<queries.Column>\`select jb->'foo'->>'bar' from test_table\`,
        sql<queries.TestTable_n>\`select n::numeric from test_table\`,
        sql<queries.TestTable_76>\`select n::text from test_table\`,
        sql<queries.Num_letter>\`select * from (values (1, 'one'), (2, 'two')) as vals (num, letter)\`,
        sql<queries.T>\`select t from (select id from test_table) t\`,
        sql<queries.TestTable_tAliased1_tNnAliased>\`
          select t as t_aliased1, t_nn as t_nn_aliased
          from test_table as tt1
          where
            t_nn in (
              select t_nn as t_aliased2
              from test_table as tt2
              where n = 1
            )
        \`,
        sql<queries.TestTable_dP>\`select d_p from test_table\`,
        sql<queries.TestTable_dPs>\`select d_ps from test_table\`,
      ]

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select * from test_table\` */
        export interface TestTable {
          /** column: \`public.test_table.id\`, not null: \`true\`, regtype: \`integer\` */
          id: number

          /** column: \`public.test_table.n\`, regtype: \`integer\` */
          n: number | null

          /**
           * Some custom comment on "t"
           *
           * column: \`public.test_table.t\`, regtype: \`text\`
           */
          t: string | null

          /** column: \`public.test_table.t_nn\`, not null: \`true\`, regtype: \`text\` */
          t_nn: string

          /** column: \`public.test_table.cv\`, regtype: \`character varying(1)\` */
          cv: string | null

          /** column: \`public.test_table.arr\`, regtype: \`text[]\` */
          arr: string[] | null

          /** column: \`public.test_table.e\`, regtype: \`test_enum\` */
          e: ('aa' | 'bb' | 'cc') | null

          /** column: \`public.test_table.tz\`, regtype: \`timestamp with time zone\` */
          tz: Date | null

          /** column: \`public.test_table.tz_nn\`, not null: \`true\`, regtype: \`timestamp with time zone\` */
          tz_nn: Date

          /** column: \`public.test_table.j\`, regtype: \`json\` */
          j: unknown

          /** column: \`public.test_table.jb\`, regtype: \`jsonb\` */
          jb: unknown

          /** column: \`public.test_table.j_nn\`, not null: \`true\`, regtype: \`json\` */
          j_nn: unknown

          /** column: \`public.test_table.jb_nn\`, not null: \`true\`, regtype: \`jsonb\` */
          jb_nn: unknown

          /** column: \`public.test_table.d_p\`, regtype: \`numeric(8,0)\` */
          d_p: number | null

          /** column: \`public.test_table.d_ps\`, regtype: \`numeric(8,4)\` */
          d_ps: number | null
        }

        /**
         * queries:
         * - \`select id, t from test_table\`
         * - \`insert into test_table(id, t_nn, j_nn, jb_nn) values (1, '', '{}', '{}') returning id, t\`
         * - \`update test_table set t = '' returning id, t\`
         * - \`insert into test_table as tt (id, j_nn, jb_nn) values (1, '{}', '{}') returning id, t\`
         * - \`update test_table as tt set t = '' returning id, t\`
         * - \`delete from test_table where t = '' returning id, t\`
         */
        export interface TestTable_id_t {
          /** column: \`public.test_table.id\`, not null: \`true\`, regtype: \`integer\` */
          id: number

          /**
           * Some custom comment on "t"
           *
           * column: \`public.test_table.t\`, regtype: \`text\`
           */
          t: string | null
        }

        /**
         * queries:
         * - \`select count(*) from test_table\`
         * - \`select count(*) from test_table group by id\`
         */
        export interface TestTable_count {
          /** not null: \`true\`, regtype: \`bigint\` */
          count: number
        }

        /** - query: \`select count(*) as cnt from test_table\` */
        export interface TestTable_cnt {
          /** not null: \`true\`, regtype: \`bigint\` */
          cnt: number
        }

        /** - query: \`select coalesce(t, 'fallback') from test_table\` */
        export interface TestTable_coalesce {
          /** not null: \`true\`, regtype: \`text\` */
          coalesce: string
        }

        /** - query: \`select coalesce(sum(n), 0) as sum from test_table\` */
        export interface TestTable_sum {
          /** not null: \`true\`, regtype: \`bigint\` */
          sum: number
        }

        /** - query: \`select id as idalias, t as talias from test_table\` */
        export interface TestTable_idalias_talias {
          /** column: \`public.test_table.id\`, not null: \`true\`, regtype: \`integer\` */
          idalias: number

          /**
           * Some custom comment on "t"
           *
           * column: \`public.test_table.t\`, regtype: \`text\`
           */
          talias: string | null
        }

        /**
         * queries:
         * - \`select id from test_table where id = $1 and n = $2\`
         * - \`select t1.id from test_table t1 join test_table t2 on t1.id = t2.n\`
         */
        export interface TestTable_id {
          /** column: \`public.test_table.id\`, not null: \`true\`, regtype: \`integer\` */
          id: number
        }

        /** - query: \`insert into test_table(id, j_nn, jb_nn) values (1, '{}', '{}')\` */
        export type _void = {}

        /** - query: \`select pg_advisory_lock(123)\` */
        export interface PgAdvisoryLock {
          /** regtype: \`void\` */
          pg_advisory_lock: void
        }

        /** - query: \`select jb->'foo'->>'bar' from test_table\` */
        export interface Column {
          /** regtype: \`text\` */
          '?column?': string | null
        }

        /** - query: \`select n::numeric from test_table\` */
        export interface TestTable_n {
          /** regtype: \`numeric\` */
          n: number | null
        }

        /** - query: \`select n::text from test_table\` */
        export interface TestTable_76 {
          /** regtype: \`text\` */
          n: string | null
        }

        /** - query: \`select * from (values (1, 'one'), (2, 'two')) as vals (num, letter)\` */
        export interface Num_letter {
          /** regtype: \`integer\` */
          num: number | null

          /** regtype: \`text\` */
          letter: string | null
        }

        /** - query: \`select t from (select id from test_table) t\` */
        export interface T {
          /** regtype: \`record\` */
          t: unknown
        }

        /** - query: \`select t as t_aliased1, t_nn as t_nn_ali... [truncated] ...ed2 from test_table as tt2 where n = 1 )\` */
        export interface TestTable_tAliased1_tNnAliased {
          /**
           * Some custom comment on "t"
           *
           * column: \`public.test_table.t\`, regtype: \`text\`
           */
          t_aliased1: string | null

          /** column: \`public.test_table.t_nn\`, not null: \`true\`, regtype: \`text\` */
          t_nn_aliased: string
        }

        /** - query: \`select d_p from test_table\` */
        export interface TestTable_dP {
          /** column: \`public.test_table.d_p\`, regtype: \`numeric(8,0)\` */
          d_p: number | null
        }

        /** - query: \`select d_ps from test_table\` */
        export interface TestTable_dPs {
          /** column: \`public.test_table.d_ps\`, regtype: \`numeric(8,4)\` */
          d_ps: number | null
        }
      }
    "
  `)
}, 15_000)

test('can write queries to separate file', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'a.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`select 1 as a\`

        module queries {
          // this should be removed!
        }
      `,
      // this file has already imported its queries - need to make sure we don't end up with a double import statement
      'b.ts': `
        import {sql} from '@pgkit/client'
        import * as queries from "./__sql__/b";

        export default sql\`select 1 as a\`

        module queries {
          // this should be removed!
        }
      `,
      // this file has already imported its queries with a type-only import
      'c.ts': `
        import {sql} from '@pgkit/client'
        import type * as queries from "./__sql__/c";

        export default sql\`select 1 as a\`

        module queries {
          // this should be removed!
        }
      `,
    },
  })

  syncer.sync()

  await typegen.generate({
    ...typegenOptions(syncer.baseDir),
    writeTypes: typegen.defaults.defaultWriteTypes({
      queriesPathFromTS: filepath => path.join(path.dirname(filepath), '__sql__', path.basename(filepath)),
    }),
  })

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    a.ts: |-
      import * as queries from './__sql__/a'
      import {sql} from '@pgkit/client'

      export default sql<queries.A>\`select 1 as a\`

    b.ts: |-
      import {sql} from '@pgkit/client'
      import * as queries from './__sql__/b'

      export default sql<queries.A>\`select 1 as a\`

    c.ts: |-
      import {sql} from '@pgkit/client'
      import type * as queries from './__sql__/c'

      export default sql<queries.A>\`select 1 as a\`

    __sql__: 
      a.ts: |-
        // Generated by @pgkit/typegen

        /** - query: \`select 1 as a\` */
        export interface A {
          /** not null: \`true\`, regtype: \`integer\` */
          a: number
        }

      b.ts: |-
        // Generated by @pgkit/typegen

        /** - query: \`select 1 as a\` */
        export interface A {
          /** not null: \`true\`, regtype: \`integer\` */
          a: number
        }

      c.ts: |-
        // Generated by @pgkit/typegen

        /** - query: \`select 1 as a\` */
        export interface A {
          /** not null: \`true\`, regtype: \`integer\` */
          a: number
        }
    "
  `)
})

test('replaces existing queries module', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`select 1 as a\`

        module queries {
          // this should be removed!
        }
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from '@pgkit/client'

      export default sql<queries.A>\`select 1 as a\`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select 1 as a\` */
        export interface A {
          /** not null: \`true\`, regtype: \`integer\` */
          a: number
        }
      }
    "
  `)
})

test('ignore irrelevant syntax', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default () => {
          if (Math.random() > 0.5) {
            const otherTag: any = (val: any) => val
            return otherTag\`foo\`
          }
          if (Math.random() > 0.5) {
            const otherTag: any = {foo: (val: any) => val}
            return otherTag.foo\`bar\`
          }
          return sql\`select 1\`
        }
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from '@pgkit/client'

      export default () => {
        if (Math.random() > 0.5) {
          const otherTag: any = (val: any) => val
          return otherTag\`foo\`
        }
        if (Math.random() > 0.5) {
          const otherTag: any = {foo: (val: any) => val}
          return otherTag.foo\`bar\`
        }
        return sql<queries.Column>\`select 1\`
      }

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select 1\` */
        export interface Column {
          /** not null: \`true\`, regtype: \`integer\` */
          '?column?': number
        }
      }
    "
  `)
})

test(`queries with syntax errors don't affect others`, async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default [
          sql\`select 1 as one\`, // this should get a valid type
          sql\`select this is a nonsense query which will cause an error\`
        ]
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(logger.warn).toHaveBeenCalledTimes(1)
  expect(logger.warn).toMatchInlineSnapshot(`
    - - >
        Error:
        ./test/fixtures/options.test.ts/queries-with-syntax-errors-don-t-affect-others/index.ts:4
        [!] Query is not typeable.
          Caused by: Error: Walking AST failed
            Caused by: Error: Syntax error at line 1 col 16:

            1  select this is a nonsense query which will cause an error
                              ^
            Unexpected word token: "a". Instead, I was expecting to see one of the following:

                - A "kw_null" token
                - A "kw_not" token
                - A "kw_not" token
                - A "kw_true" token
                - A "kw_false" token
  `)

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from '@pgkit/client'

      export default [
        sql<queries.One>\`select 1 as one\`, // this should get a valid type
        sql\`select this is a nonsense query which will cause an error\`,
      ]

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select 1 as one\` */
        export interface One {
          /** not null: \`true\`, regtype: \`integer\` */
          one: number
        }
      }
    "
  `)
})

test('custom include pattern', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'excluded.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`select 0 as a\`
      `,
      'included1.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`select 1 as a\`
      `,
      'included2.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`select 2 as a\`
      `,
    },
  })

  syncer.sync()

  await typegen.generate({
    ...typegenOptions(syncer.baseDir),
    include: ['included*.ts'],
  })

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    excluded.ts: |-
      import {sql} from '@pgkit/client'

      export default sql\`select 0 as a\`

    included1.ts: |-
      import {sql} from '@pgkit/client'

      export default sql<queries.A>\`select 1 as a\`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select 1 as a\` */
        export interface A {
          /** not null: \`true\`, regtype: \`integer\` */
          a: number
        }
      }

    included2.ts: |-
      import {sql} from '@pgkit/client'

      export default sql<queries.A>\`select 2 as a\`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select 2 as a\` */
        export interface A {
          /** not null: \`true\`, regtype: \`integer\` */
          a: number
        }
      }
    "
  `)
})
