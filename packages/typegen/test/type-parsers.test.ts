import * as fsSyncer from 'fs-syncer'
import * as typegen from '../src'
import {createTypeParserPreset} from 'slonik'
import {getHelper} from './helper'
import {getPoolHelper} from '@slonik/migrator/test/pool-helper'

export const {gdescParams, logger, poolHelper: helper} = getHelper({__filename})

test('type parsers have types inferred', async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      export default [
        sql\`select '2000-01-01'::timestamptz, 1::int8, true::bool, '{}'::json\`,
      ]
    `,
  })

  syncer.sync()

  const baseParams = gdescParams(syncer.baseDir)
  const {pool} = getPoolHelper({
    __filename,
    config: {
      typeParsers: [
        ...createTypeParserPreset(),
        {
          name: 'timestamptz',
          parse: str => new Date(str),
        },
        {
          name: 'int8',
          parse: str => BigInt(str),
        },
        {
          name: 'bool',
          parse: str => Boolean(str),
        },
        {
          name: 'json',
          parse: () => Symbol(`this won't be matched by anything so should result in an 'unknown' type`),
        },
      ],
    },
  })

  await typegen.generate({
    ...baseParams,
    pool,
  })

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default [sql<queries.Anonymous>\`select '2000-01-01'::timestamptz, 1::int8, true::bool, '{}'::json\`]
      
      module queries {
        /** - query: \`select '2000-01-01'::timestamptz, 1::int8, true::bool, '{}'::json\` */
        export interface Anonymous {
          /** postgres type: \`timestamp with time zone\` */
          timestamptz: Date | null
      
          /** postgres type: \`bigint\` */
          int8: bigint | null
      
          /** postgres type: \`boolean\` */
          bool: boolean | null
      
          /** postgres type: \`json\` */
          json: unknown
        }
      }
      "
  `)
})
