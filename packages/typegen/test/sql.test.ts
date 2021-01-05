import * as fsSyncer from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import {getPoolHelper} from '@slonik/migrator/test/pool-helper'

const helper = getPoolHelper({__filename})

const gdescParams = (baseDir: string): Partial<gdesc.GdescriberParams> => ({
  rootDir: baseDir,
  pool: helper.pool,
  psqlCommand: `docker-compose exec -T postgres psql "postgresql://postgres:postgres@localhost:5432/postgres?options=--search_path%3d${helper.schemaName}"`,
})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table test_table(
      id int primary key,
      n int
    );
  `)
})

test('edit before write', async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'query1.sql': `select id, n from test_table`,
    'query2.sql': `select n as aaa from test_table`,
  })

  syncer.sync()

  await gdesc.gdescriber(gdescParams(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    query1.sql: |-
      select id, n from test_table
      
    query2.sql: |-
      select n as aaa from test_table
      
    __sql__: 
      query1.sql.ts: |-
        /** - query: \`select id, n from test_table\` */
        export interface TestTable {
          /** column: \`sql_test.test_table.id\`, not null: \`true\`, postgres type: \`integer\` */
          id: number
          /** column: \`sql_test.test_table.n\`, postgres type: \`integer\` */
          n: number | null
        }
        
      query2.sql.ts: |-
        /** - query: \`select n as aaa from test_table\` */
        export interface TestTable {
          /** column: \`sql_test.test_table.n\`, postgres type: \`integer\` */
          aaa: number | null
        }
        "
  `)
}, 20000)
