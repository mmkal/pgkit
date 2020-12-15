import {join} from 'path'
import {range} from 'lodash'
import {sql} from 'slonik'
import * as dedent from 'dedent'
import {fsSyncer} from 'fs-syncer'
import {SlonikMigrator} from '../src'
import {getPoolHelper} from './pool-helper'

const helper = getPoolHelper({__filename})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = jest.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

describe('run sql, js and ts migrations', () => {
  const migrationsPath = join(__dirname, 'generated/run/migrations')

  const mockLogger = jest.fn()
  const log = mockLogger

  const syncer = fsSyncer(migrationsPath, {
    '01.one.sql': 'create table migration_test_1(id int)',
    '02.two.sql': 'create table migration_test_2(id int)',
    '03.three.js': dedent`
      module.exports.up = ({slonik, sql}) => slonik.query(sql\`create table migration_test_3(id int)\`)
      module.exports.down = ({slonik, sql}) => slonik.query(sql\`drop table migration_test_3\`)
    `,
    '04.four.ts': dedent`
      import {Migration} from '../../../..'

      export const up: Migration = ({slonik, sql}) => slonik.query(sql\`create table migration_test_4(id int)\`)
      export const down: Migration = ({slonik, sql}) => slonik.query(sql\`drop table migration_test_4\`)
    `,
    down: {
      '01.one.sql': 'drop table migration_test_1',
      '02.two.sql': 'drop table migration_test_2',
    },
  })

  beforeEach(async () => {
    syncer.sync()
  })

  const migrationTables = () =>
    helper.pool.anyFirst(sql`
      select tablename
      from pg_catalog.pg_tables
      where tablename like 'migration_test_%'
      and schemaname = ${helper.schemaName}
      order by tablename
    `)

  test('up and down', async () => {
    const migrator = new SlonikMigrator({
      slonik: helper.pool,
      migrationsPath,
      migrationTableName: 'migration_meta_1',
      logger: {
        debug: log,
        info: log,
        warn: log,
        error: log,
      },
    })

    expect(await migrationTables()).toEqual([])

    const executed = () => migrator.executed().then(list => list.map(x => x.name))
    const pending = () => migrator.pending().then(list => list.map(x => x.name))

    log(`getting pending migrations before initial 'up'`)

    const allMigrations = await pending()
    expect(allMigrations).toMatchInlineSnapshot(`
      Array [
        "01.one.sql",
        "02.two.sql",
        "03.three.js",
        "04.four.ts",
      ]
    `)

    await migrator.up()

    const allTables = await migrationTables()
    expect(allTables).toMatchInlineSnapshot(`
      Array [
        "migration_test_1",
        "migration_test_2",
        "migration_test_3",
        "migration_test_4",
      ]
    `)

    expect(await executed()).toEqual(allMigrations)
    expect(await pending()).toEqual([])

    // make sure `.down` with no arg reverts only the last migration
    await migrator.down()
    expect(await migrationTables()).toEqual(allTables.slice(0, -1))
    expect(await executed()).toEqual(allMigrations.slice(0, -1))
    expect(await pending()).toEqual(allMigrations.slice(-1))

    await migrator.down()
    expect(await migrationTables()).toEqual(allTables.slice(0, -2))
    expect(await executed()).toEqual(allMigrations.slice(0, -2))
    expect(await pending()).toEqual(allMigrations.slice(-2))

    await migrator.up()
    expect(await migrationTables()).toEqual(allTables)
    expect(await executed()).toEqual(allMigrations)
    expect(await pending()).toEqual([])

    await migrator.down({to: '02.two.sql'})
    expect(await executed()).toMatchInlineSnapshot(`
      Array [
        "01.one.sql",
      ]
    `)

    await migrator.down({to: 0})
    expect(await executed()).toEqual([])

    await migrator.up({to: '03.three.js'})
    expect(await executed()).toMatchInlineSnapshot(`
      Array [
        "01.one.sql",
        "02.two.sql",
        "03.three.js",
      ]
    `)

    expect(
      mockLogger.mock.calls.map(msg => {
        const json = JSON.stringify(msg)
        return JSON.parse(json.replace(/\d\.\d+/g, '0.001'))
      }),
    ).toMatchSnapshot()
  })
})
