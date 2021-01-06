import * as fsSyncer from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import {getHelper} from './helper'

export const {gdescParams, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table test_table_1(a int not null);
    create table test_table_2(b int not null);
  `)
})

test('default to nullable for statically ambiguous columns', async () => {
  // Postgres is able to figure out that column a is from test_table 1 and
  // column b is from test_table_2 but this isn't possible to determine statically,
  // so both columns will be considered nullable (since we don't know what table
  // they are from)
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      export default sql\`
        select a, b
        from test_table_1
        join test_table_2
        on a = b
      \`
    `,
  })

  syncer.sync()

  await gdesc.gdescriber({
    ...gdescParams(syncer.baseDir),
    logger: console,
  })

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default sql<queries.TestTable1_TestTable2>\`
        select a, b
        from test_table_1
        join test_table_2
        on a = b
      \`
      
      module queries {
        /** - query: \`select a, b from test_table_1 join test_table_2 on a = b\` */
        export interface TestTable1_TestTable2 {
          /** column: \`two_tables_test.test_table_1.a\`, not null: \`true\`, postgres type: \`integer\` */
          a: number
      
          /** column: \`two_tables_test.test_table_2.b\`, not null: \`true\`, postgres type: \`integer\` */
          b: number
        }
      }
      "
  `)
})

test('workaround by specifying table in column reference', async () => {
  // workaround the above issue by explicitly specifying the table each column is from
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      export default sql\`
        select t1.a, t2.b
        from test_table_1 t1
        join test_table_2 t2
        on a = b
      \`
    `,
  })

  syncer.sync()

  await gdesc.gdescriber({
    ...gdescParams(syncer.baseDir),
  })

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default sql<queries.TestTable1_TestTable2>\`
        select t1.a, t2.b
        from test_table_1 t1
        join test_table_2 t2
        on a = b
      \`
      
      module queries {
        /** - query: \`select t1.a, t2.b from test_table_1 t1 join test_table_2 t2 on a = b\` */
        export interface TestTable1_TestTable2 {
          /** column: \`two_tables_test.test_table_1.a\`, not null: \`true\`, postgres type: \`integer\` */
          a: number
      
          /** column: \`two_tables_test.test_table_2.b\`, not null: \`true\`, postgres type: \`integer\` */
          b: number
        }
      }
      "
  `)
})
