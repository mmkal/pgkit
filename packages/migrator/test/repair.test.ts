import {sql} from '@pgkit/client'
import {fsSyncer} from 'fs-syncer'
import {range} from 'lodash'
import * as path from 'path'
import {describe, expect, test, vi as jest, beforeEach} from 'vitest'
import {Migrator} from './migrator'
import {getPoolHelper} from './pool-helper'

const {pool, ...helper} = getPoolHelper({__filename})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = jest.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

describe('repair broken hashes', () => {
  const migrationsPath = path.join(__dirname, `generated/${helper.id}`)

  const syncer = fsSyncer(migrationsPath, {
    '01.one.sql': 'create table migration_test_1(id int)',
    down: {
      '01.one.sql': 'drop table migration_test_1',
    },
  })

  let migrator: Migrator

  beforeEach(async () => {
    syncer.sync()
    migrator = new Migrator({
      client: pool,
      migrationsPath,
      migrationTableName: 'migrations',
    })

    await migrator.up()
  })

  test.each([[true], [false]])(`dryRun = %s`, async dryRun => {
    const getDbHash = async () =>
      pool.oneFirst<string>(sql`
        select hash
        from migrations
      `)
    const setDbHash = async (hash: string) =>
      pool.any(sql`
        update migrations
        set hash = ${hash}
      `)
    const dbHashCorrect = await getDbHash()
    await setDbHash('asd')
    await expect(getDbHash()).resolves.not.toEqual(dbHashCorrect)

    await migrator.repair({dryRun})

    const dbHashAfterRepair = await getDbHash()

    if (dryRun) expect(dbHashAfterRepair).not.toEqual(dbHashCorrect)
    else expect(dbHashAfterRepair).toEqual(dbHashCorrect)
  })
})
