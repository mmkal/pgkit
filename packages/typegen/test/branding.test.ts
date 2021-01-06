import * as fsSyncer from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import {getHelper} from './helper'

export const {gdescParams, logger, poolHelper: helper} = getHelper({__filename})

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
    'index.ts': `
      import {sql} from 'slonik'

      export default sql\`select id, n from test_table\`
    `,
  })

  syncer.sync()

  await gdesc.gdescriber({
    ...gdescParams(syncer.baseDir),
    writeTypes: queries => {
      queries.forEach(query => {
        query.fields.forEach(field => {
          if (field.column?.endsWith('.id')) {
            field.typescript = `(${field.typescript} & { _brand: ${JSON.stringify(field.column)} })`
          }
        })
      })
      return gdesc.defaultWriteTypes()(queries)
    },
  })

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default sql<queries.TestTable>\`select id, n from test_table\`
      
      module queries {
        /** - query: \`select id, n from test_table\` */
        export interface TestTable {
          /** column: \`branding_test.test_table.id\`, not null: \`true\`, postgres type: \`integer\` */
          id: number & {
            _brand: 'branding_test.test_table.id'
          }
      
          /** column: \`branding_test.test_table.n\`, postgres type: \`integer\` */
          n: number | null
        }
      }
      "
  `)
})
