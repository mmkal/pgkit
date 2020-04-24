import {statSync, readdirSync, unlinkSync, writeFileSync, existsSync} from 'fs'
import {join} from 'path'
import {range, map} from 'lodash'
import {createPool, sql} from 'slonik'
import {setupSlonikMigrator} from '../src'
import * as dedent from 'dedent'
import {inspect} from 'util'
import {EOL} from 'os'

import {fsSyncer} from 'fs-syncer'

const slonik = createPool('postgresql://postgres:postgres@localhost:5433/postgres', {idleTimeout: 1})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = jest.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

describe('run migrations', () => {
  const migrationsPath = join(__dirname, 'generated/run/migrations')

  const migrator = setupSlonikMigrator({slonik, migrationsPath, migrationTableName: 'migration_test'})

  const syncer = fsSyncer(migrationsPath, {
    '01.one.sql': 'create table migration_test_1(id int)',
    '02.two.sql': 'create table migration_test_2(id int)',
    '03.three.js': dedent`
      module.exports.up = ({slonik, sql}) => slonik.query(sql\`create table migration_test_3(id int)\`)
      module.exports.down = ({slonik, sql}) => slonik.query(sql\`drop table migration_test_3\`)
    `,
    '04.four.ts': dedent`
      import {Migration} from '../..'
      
      export const up: Migration = ({slonik, sql}) => slonik.query(sql\`create table migration_test_4(id int)\`)
      export const down: Migration = ({slonik, sql}) => slonik.query(sql\`drop table migration_test_4\`)
    `,
    down: {
      '01.one.sql': 'drop table migration_test_1',
      '02.two.sql': 'drop table migration_test_2',
    },
  })

  const deleteTables = () =>
    slonik.query(sql`
      drop table if exists migration_test;
      drop table if exists migration_test_;
      drop table if exists migration_test_1;
      drop table if exists migration_test_2;
      drop table if exists migration_test_3;
      drop table if exists migration_test_4;
    `)

  beforeAll(async () => {
    await deleteTables()
    await syncer.sync()
  })

  const migrationTables = () =>
    slonik.anyFirst(sql`
      select tablename
      from pg_catalog.pg_tables
      where tablename like 'migration_test_%'
      order by tablename
    `)

  test('up and down', async () => {
    expect(await migrationTables()).toEqual([])

    const executed = () => migrator.executed().then(list => list.map(x => x.file))
    const pending = () => migrator.pending().then(list => list.map(x => x.file))
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

    await migrator.down('02.two.sql')
    expect(await executed()).toMatchInlineSnapshot(`
      Array [
        "01.one.sql",
      ]
    `)
  })
})

// https://github.com/gajus/slonik/issues/63#issuecomment-500889445
afterAll(() => new Promise(r => setTimeout(r, 1)))
