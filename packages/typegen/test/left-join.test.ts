import * as fsSyncer from 'fs-syncer'
import * as typegen from '../src'
import {getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table table1(a int not null);
    create table table2(b int not null);

    insert into table1 (a) values (1), (2), (3);
    insert into table2 (b) values (2), (3), (4);
  `)
})

test('left join', async () => {
  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql, createPool} from 'slonik'

        export default async () => {
          const pool = createPool('...connection string...')

          return pool.query(sql\`
            select a, b
            from table1
            left join table2 on table1.a = table2.b
          \`)
        }
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql, createPool} from 'slonik'
      
      export default async () => {
        const pool = createPool('...connection string...')
      
        return pool.query(sql<queries.Table1_Table2>\`
          select a, b
          from table1
          left join table2 on table1.a = table2.b
        \`)
      }
      
      export declare namespace queries {
        /** - query: \`select a, b from table1 left join table2 on table1.a = table2.b\` */
        export interface Table1_Table2 {
          /** column: \`left_join_test.table1.a\`, not null: \`true\`, regtype: \`integer\` */
          a: number
      
          /** column: \`left_join_test.table2.b\`, regtype: \`integer\` */
          b: number | null
        }
      }
      "
  `)
})

test('full outer join', async () => {
  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql, createPool} from 'slonik'

        export default async () => {
          const pool = createPool('...connection string...')

          return pool.query(sql\`
            select a, b
            from table1
            full outer join table2 on table1.a = table2.b
          \`)
        }
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql, createPool} from 'slonik'
      
      export default async () => {
        const pool = createPool('...connection string...')
      
        return pool.query(sql<queries.Table1_Table2>\`
          select a, b
          from table1
          full outer join table2 on table1.a = table2.b
        \`)
      }
      
      export declare namespace queries {
        /** - query: \`select a, b from table1 full outer join table2 on table1.a = table2.b\` */
        export interface Table1_Table2 {
          /** column: \`left_join_test.table1.a\`, not null: \`true\`, regtype: \`integer\` */
          a: number
      
          /** column: \`left_join_test.table2.b\`, regtype: \`integer\` */
          b: number | null
        }
      }
      "
  `)
})
