import * as fsSyncer from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import {getPoolHelper} from '@slonik/migrator/test/pool-helper'
import {createTypeParserPreset} from 'slonik'

const helper = getPoolHelper({__filename})

const gdescParams = (baseDir: string): Partial<gdesc.GdescriberParams> => ({
  rootDir: baseDir,
  pool: helper.pool,
  psqlCommand: `docker-compose exec -T postgres psql "postgresql://postgres:postgres@localhost:5432/postgres?options=--search_path%3d${helper.schemaName}"`,
})

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

  await gdesc.gdescriber({
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
}, 20000)
