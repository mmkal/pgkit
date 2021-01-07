import * as fsSyncer from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import {getHelper} from './helper'

export const {gdescParams, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table test_table(foo int not null, bar text);

    comment on column test_table.bar is 'Look, ma! A comment from postgres!'
  `)
})

test('example typegen', async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql, createPool} from 'slonik'

      export default async () => {
        const pool = createPool('...connection string...')

        const results = await pool.query(sql\`select foo, bar from test_table\`)

        results.rows.forEach(r => {
          console.log(r.foo) // foo has type 'number'
          console.log(r.bar) // bar has type 'string | null'
        })
      }
    `,
  })

  syncer.sync()

  await gdesc.gdescriber(gdescParams(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql, createPool} from 'slonik'
      
      export default async () => {
        const pool = createPool('...connection string...')
      
        const results = await pool.query(sql<queries.TestTable>\`select foo, bar from test_table\`)
      
        results.rows.forEach(r => {
          console.log(r.foo) // foo has type 'number'
          console.log(r.bar) // bar has type 'string | null'
        })
      }
      
      module queries {
        /** - query: \`select foo, bar from test_table\` */
        export interface TestTable {
          /** column: \`example_test.test_table.foo\`, not null: \`true\`, postgres type: \`integer\` */
          foo: number
      
          /**
           * Look, ma! A comment from postgres!
           *
           * column: \`example_test.test_table.bar\`, postgres type: \`text\`
           */
          bar: string | null
        }
      }
      "
  `)
})