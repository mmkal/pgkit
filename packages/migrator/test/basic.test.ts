import * as path from 'path'
import {range} from 'lodash'
import {sql} from 'slonik'
import {SlonikMigrator} from '../src'
import {fsSyncer} from 'fs-syncer'
import {getPoolHelper} from './pool-helper'

const {pool, ...helper} = getPoolHelper({__filename})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = jest.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

describe('run migrations', () => {
  const migrationsPath = path.join(__dirname, `generated/${helper.schemaName}`)

  const syncer = fsSyncer(migrationsPath, {
    '01.one.sql': 'create table migration_test_1(id int)',
    '02.two.sql': 'create table migration_test_2(id int)',
    down: {
      '01.one.sql': 'drop table migration_test_1',
      '02.two.sql': 'drop table migration_test_2',
    },
  })

  beforeEach(async () => {
    syncer.sync()
  })

  test('up and down', async () => {
    const migrator = new SlonikMigrator({
      slonik: pool,
      migrationsPath,
      migrationTableName: 'migrations',
      logger: undefined,
    })

    const schemaTables = () =>
      pool.anyFirst(sql`
        select tablename
        from pg_catalog.pg_tables
        where schemaname = ${helper.schemaName}
        order by tablename
      `)

    await expect(schemaTables()).resolves.toEqual([])

    expect((await migrator.pending()).map(p => p.name)).toEqual(['01.one.sql', '02.two.sql'])

    await migrator.up()

    await expect(schemaTables()).resolves.toEqual(['migration_test_1', 'migration_test_2', 'migrations'])

    await expect(migrator.pending()).resolves.toEqual([])
  })

  test('migrationTableName array format', async () => {
    await pool.query(sql`drop schema if exists some_other_schema cascade`)
    await pool.query(sql`create schema some_other_schema`)

    const migrator = new SlonikMigrator({
      slonik: pool,
      migrationsPath,
      migrationTableName: ['some_other_schema', 'migration_meta'],
      logger: undefined,
    })

    await migrator.up({to: '01.one.sql'})

    expect(await migrator.executed().then(helper.names)).toEqual(['01.one.sql'])

    expect(await pool.manyFirst(sql`select name from some_other_schema.migration_meta`)).toEqual(['01.one.sql'])
  })
})
