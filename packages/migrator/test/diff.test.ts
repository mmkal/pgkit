import {fsSyncer} from 'fs-syncer'
import {range} from 'lodash'
import * as path from 'path'
import {describe, expect, test, vi as jest} from 'vitest'
import {Migrator} from './migrator'
import {getPoolHelper} from './pool-helper'

const {pool, ...helper} = getPoolHelper({__filename})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = jest.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

describe('diff', () => {
  const fixturePath = path.join(__dirname, `generated/${helper.id}`)

  const syncer = fsSyncer(fixturePath, {
    migrations: {
      '01.one.sql': 'create table test_table(id int)',
    },
    'definitions.sql': `
      create table test_table(id int, name text);
      create index test_table_idx on test_table(name);
    `,
  })

  let migrator: Migrator

  test(`create a diff file`, async () => {
    syncer.sync()

    migrator = new Migrator({
      client: pool,
      migrationsPath: syncer.baseDir + '/migrations',
      migrationTableName: [`${helper.id}_migrations`],
    })

    const applied = await migrator.up()
    expect(applied).toHaveLength(1)
    await migrator.diffCreate([`${syncer.baseDir}/definitions.sql`])

    expect(syncer.read()).toMatchInlineSnapshot(`
      {
        "definitions.sql": "
            create table test_table(id int, name text);
            create index test_table_idx on test_table(name);
          ",
        "migrations": {
          "01.one.sql": "create table test_table(id int)",
          "2000.01.01T00.00.00.alter_table-test_table-add_column-name_6e01aca.sql": "alter table "public"."test_table" add column "name" text;

      CREATE INDEX test_table_idx ON public.test_table USING btree (name);

      ",
        },
      }
    `)
  })

  test('create a definition file', async () => {
    syncer.sync()

    migrator = new Migrator({
      client: pool,
      migrationsPath: syncer.baseDir + '/migrations',
      migrationTableName: [`${helper.id}_migrations`],
    })

    const applied = await migrator.up()
    expect(applied).toHaveLength(1)

    await migrator.writeDefinitionFile(`${syncer.baseDir}/definitions.sql`)

    expect(syncer.read()).toMatchInlineSnapshot(`
      {
        "definitions.sql": "
        create table "public"."test_table" (
          "id" integer
            );


      ",
        "migrations": {
          "01.one.sql": "create table test_table(id int)",
        },
      }
    `)
  })
})
