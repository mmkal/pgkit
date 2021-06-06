import * as fsSyncer from 'fs-syncer'
import * as typegen from '../src'
import {getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

test(`statement with CTE`, async () => {
  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`
          with abc as (select table_name as tname from information_schema.tables),
          def as (select table_schema as tschema from information_schema.tables)
          select tname as n, tschema as s from abc join def on abc.tname = def.tschema
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
        with abc as (select table_name as tname from information_schema.tables),
        def as (select table_schema as tschema from information_schema.tables)
        select tname as n, tschema as s from abc join def on abc.tname = def.tschema
      \`
      
      export declare namespace queries {
        /** - query: \`with abc as (select table_name as tname ... [truncated] ... abc join def on abc.tname = def.tschema\` */
        export interface Abc_Def {
          /** regtype: \`name\` */
          n: string | null
      
          /** regtype: \`name\` */
          s: string | null
        }
      }
      "
  `)
})
