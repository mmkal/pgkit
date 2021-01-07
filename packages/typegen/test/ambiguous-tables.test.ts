import * as fsSyncer from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import {getHelper} from './helper'

export const {gdescParams, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    drop schema if exists test_schema_1 cascade;
    drop schema if exists test_schema_2 cascade;

    create schema test_schema_1;
    create schema test_schema_2;

    create table test_schema_1.test_table(id int not null);
    create table test_schema_2.test_table(id int);

    comment on column test_schema_1.test_table.id is 'This is a comment for test_schema_1.test_table.id';
    comment on column test_schema_2.test_table.id is 'This is a comment for test_schema_2.test_table.id';
  `)
})

test('disambiguate between same-named tables', async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      export default [
        sql\`select * from test_schema_1.test_table\`,
        sql\`select * from test_schema_2.test_table\`,
      ]
    `,
  })

  syncer.sync()

  await gdesc.gdescriber(gdescParams(syncer.baseDir))

  const result = syncer.read()

  expect(result['index.ts']).toContain(`This is a comment for test_schema_1.test_table.id`)
  expect(result['index.ts']).toContain(
    'column: `test_schema_1.test_table.id`, not null: `true`, postgres type: `integer`',
  )
  expect(result['index.ts']).toContain(`This is a comment for test_schema_2.test_table.id`)
  expect(result['index.ts']).toContain('column: `test_schema_2.test_table.id`, postgres type: `integer`')

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default [
        sql<queries.TestTable>\`select * from test_schema_1.test_table\`,
        sql<queries.TestTable_0>\`select * from test_schema_2.test_table\`,
      ]
      
      module queries {
        /** - query: \`select * from test_schema_1.test_table\` */
        export interface TestTable {
          /**
           * This is a comment for test_schema_1.test_table.id
           *
           * column: \`test_schema_1.test_table.id\`, not null: \`true\`, postgres type: \`integer\`
           */
          id: number
        }
      
        /** - query: \`select * from test_schema_2.test_table\` */
        export interface TestTable_0 {
          /**
           * This is a comment for test_schema_2.test_table.id
           *
           * column: \`test_schema_2.test_table.id\`, postgres type: \`integer\`
           */
          id: number | null
        }
      }
      "
  `)
})
