import * as fsSyncer from 'fs-syncer'
import * as typegen from '../src'
import {getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

test(`default type mappings`, async () => {
  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`
          select
            null::timestamptz as a,
            null::uuid as b,
            null::void as c
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
      
      export default sql<queries.A_b_c>\`
        select
          null::timestamptz as a,
          null::uuid as b,
          null::void as c
      \`
      
      export declare namespace queries {
        /** - query: \`select null::timestamptz as a, null::uuid as b, null::void as c\` */
        export interface A_b_c {
          /** regtype: \`timestamp with time zone\` */
          a: number | null
      
          /** regtype: \`uuid\` */
          b: string | null
      
          /** regtype: \`void\` */
          c: void
        }
      }
      "
  `)
})
