import * as fsSyncer from 'fs-syncer'
import {test, beforeEach, expect} from 'vitest'
import * as typegen from '../src'
import {getPureHelper as getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.setupDb()
  await helper.pool.query(helper.sql`
    create table test_table(
      id int primary key,
      n int
    );
  `)
})

test('branded types', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export default sql\`select id, n from test_table\`
      `,
    },
  })

  syncer.sync()

  await typegen.generate({
    ...typegenOptions(syncer.baseDir),
    writeTypes: async queries => {
      queries.forEach(query => {
        query.fields.forEach(field => {
          if (field.column?.name === 'id') {
            const brand = Object.values(field.column).join('.')
            field.typescript = `(${field.typescript} & { _brand: ${JSON.stringify(brand)} })`
          }
        })
      })
      return typegen.defaults.defaultWriteTypes()(queries)
    },
  })

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from '@pgkit/client'

      export default sql<queries.TestTable>\`select id, n from test_table\`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select id, n from test_table\` */
        export interface TestTable {
          /** column: \`public.test_table.id\`, not null: \`true\`, regtype: \`integer\` */
          id: number & {
            _brand: 'public.test_table.id'
          }

          /** column: \`public.test_table.n\`, regtype: \`integer\` */
          n: number | null
        }
      }
    "
  `)
})
