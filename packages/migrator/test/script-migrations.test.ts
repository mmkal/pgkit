import {sql} from '@pgkit/client'
import dedent from 'dedent'
import {fsSyncer} from 'fs-syncer'
import {range} from 'lodash'
import * as path from 'path'
import {describe, expect, test, vi as jest, beforeEach} from 'vitest'
import {Migrator} from './migrator'
import {getPoolHelper} from './pool-helper'

const helper = getPoolHelper({__filename})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = jest.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

describe('run sql, js and ts migrations', () => {
  const migrationsPath = path.join(__dirname, 'generated/run/migrations')

  const mockLogger = jest.fn()
  const log = mockLogger

  const syncer = fsSyncer(migrationsPath, {
    '01.one.sql': 'create table migration_test_1(id int)',
    '02.two.sql': 'create table migration_test_2(id int)',
    '03.three.js': dedent`
      module.exports.up = ({context: {connection, sql}}) => connection.query(sql\`create table migration_test_3(id int)\`)
      module.exports.down = ({context: {connection, sql}}) => connection.query(sql\`drop table migration_test_3\`)
    `,
    '04.four.ts': dedent`
      import {Migration} from '../../../../src'

      export const up: Migration = ({context: {connection, sql}}) => connection.query(sql\`create table migration_test_4(id int)\`)
      export const down: Migration = ({context: {connection, sql}}) => connection.query(sql\`drop table migration_test_4\`)
    `,
    down: {
      '01.one.sql': 'drop table migration_test_1',
      '02.two.sql': 'drop table migration_test_2',
    },
  })

  beforeEach(async () => {
    syncer.sync()
  })

  const migrationTables = async () =>
    helper.pool.anyFirst(sql`
      select tablename
      from pg_catalog.pg_tables
      where tablename like 'migration_test_%'
      and schemaname = ${helper.schemaName}
      order by tablename
    `)

  test('up and down', async () => {
    const migrator = new Migrator({
      client: helper.pool,
      migrationsPath,
      migrationTableName: 'migration_meta_1',
      logger: {debug: log, info: log, warn: log, error: log},
    })

    expect(await migrationTables()).toEqual([])

    const executed = async () => migrator.executed().then(list => list.map(x => x.name))
    const pending = async () => migrator.pending().then(list => list.map(x => x.name))

    log(`getting pending migrations before initial 'up'`)

    const allMigrations = await pending()
    expect(allMigrations).toMatchInlineSnapshot(`
      [
        "01.one.sql",
        "02.two.sql",
        "03.three.js",
        "04.four.ts",
      ]
    `)

    await migrator.up()

    const allTables = await migrationTables()
    expect(allTables).toMatchInlineSnapshot(`
      [
        "migration_test_1",
        "migration_test_2",
        "migration_test_3",
        "migration_test_4",
      ]
    `)

    expect(await executed()).toEqual(allMigrations)
    expect(await pending()).toEqual([])

    await migrator.down({to: 0 as const})
    expect(await executed()).toEqual([])

    await migrator.up({to: '03.three.js'})
    expect(await executed()).toMatchInlineSnapshot(`
      [
        "01.one.sql",
        "02.two.sql",
        "03.three.js",
      ]
    `)

    expect(
      mockLogger.mock.calls.map(msg => {
        const json = JSON.stringify(msg)
        return JSON.parse(json, (key, value) => (key === 'durationSeconds' ? 0.001 : value))
      }),
    ).toMatchSnapshot()
  })
})
