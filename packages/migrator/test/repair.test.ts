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

describe('repair broken hashes', () => {
  const migrationsPath = path.join(__dirname, `generated/${helper.schemaName}`)

  const syncer = fsSyncer(migrationsPath, {
    '01.one.sql': 'create table migration_test_1(id int)',
    down: {
      '01.one.sql': 'drop table migration_test_1',
    },
  })

  let migrator: SlonikMigrator

  beforeEach(async () => {
    syncer.sync()
    migrator = new SlonikMigrator({
      slonik: pool,
      migrationsPath,
      migrationTableName: 'migrations',
      logger: undefined,
    })

    await migrator.up()
  })

  test('repair broken hash', async () => {
    const getDbHash = () =>
      pool.oneFirst<string>(sql`
        select hash
        from migrations
      `)
    const setDbHash = (hash: string) =>
      pool.any(sql`
        update migrations
        set hash = ${hash}
      `)
    const dbHashCorrect = await getDbHash()
    await setDbHash('asd')
    await expect(getDbHash()).resolves.not.toEqual(dbHashCorrect)

    await migrator.repair()

    await expect(getDbHash()).resolves.toEqual(dbHashCorrect)
  })
})
