import * as fsSyncer from 'fs-syncer'
import {test, beforeEach, expect} from 'vitest'

import * as typegen from '../src'
import {getPureHelper as getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.setupDb()
})

test(`default type mappings`, async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from '@pgkit/client'

        export const mappings = sql\`
          select
            null::timestamptz as a,
            null::uuid as b,
            null::void as c,
            null::bigint as d,
            null::smallint as e,
            null::time as f,
            null::bit as g,
            null::money as h,
            null::cidr as i,
            null::float8 as j,
            null::interval as k,
            null::real as l,
            null::character as m,
            null::character varying as n
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
      import {sql} from '@pgkit/client'

      export const mappings = sql<queries.Mapping>\`
        select
          null::timestamptz as a,
          null::uuid as b,
          null::void as c,
          null::bigint as d,
          null::smallint as e,
          null::time as f,
          null::bit as g,
          null::money as h,
          null::cidr as i,
          null::float8 as j,
          null::interval as k,
          null::real as l,
          null::character as m,
          null::character varying as n
      \`

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select null::timestamptz as a, null::uui... [truncated] ...acter as m, null::character varying as n\` */
        export interface Mapping {
          /** regtype: \`timestamp with time zone\` */
          a: Date | null

          /** regtype: \`uuid\` */
          b: string | null

          /** regtype: \`void\` */
          c: void

          /** regtype: \`bigint\` */
          d: number | null

          /** regtype: \`smallint\` */
          e: number | null

          /** regtype: \`time without time zone\` */
          f: string | null

          /** regtype: \`bit\` */
          g: number | null

          /** regtype: \`money\` */
          h: string | null

          /** regtype: \`cidr\` */
          i: string | null

          /** regtype: \`double precision\` */
          j: number | null

          /** regtype: \`interval\` */
          k: string | null

          /** regtype: \`real\` */
          l: number | null

          /** regtype: \`character\` */
          m: string | null

          /** regtype: \`character varying\` */
          n: string | null
        }
      }
    "
  `)
})
