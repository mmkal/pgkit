import {fsSyncer} from 'fs-syncer'
import * as jsYaml from 'js-yaml'
import {range} from 'lodash'
import * as path from 'path'
import {describe, beforeEach, expect, vi, afterAll, test} from 'vitest'
import {Migrator} from './migrator'
import {getPoolHelper} from './pool-helper'

const helper = getPoolHelper({__filename})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = vi.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

expect.addSnapshotSerializer({
  test: val => val && typeof val === 'object',
  print: val => jsYaml.dump(val),
})

describe('create', () => {
  const syncer = fsSyncer(path.join(__dirname, 'generated', helper.id), {})

  const migrator = new Migrator({
    client: helper.pool,
    migrationsPath: syncer.baseDir,
    migrationTableName: 'migration',
  })

  beforeEach(() => {
    syncer.sync()
    toISOSpy.mockClear()
  })

  afterAll(syncer.sync)

  test('creates sql, js and ts files', async () => {
    await migrator.create({name: 'sql123.sql'})
    await migrator.create({name: 'javascript456.js'})
    await migrator.create({name: 'typescript789.ts'})

    await expect(migrator.create({name: 'text.txt'})).rejects.toThrow(/Extension .txt not allowed./)

    expect(syncer.read()).toMatchInlineSnapshot(`
      2000.01.01T00.00.00.sql123.sql: |
        raise 'up migration not implemented'
      2000.01.02T00.00.00.javascript456.js: |
        /** @type {import('@pgkit/migrator').Migration} */
        exports.up = async ({context: {connection, sql}}) => {
          await connection.query(sql\`raise 'up migration not implemented'\`)
        }

        /** @type {import('@pgkit/migrator').Migration} */
        exports.down = async ({context: {connection, sql}}) => {
          await connection.query(sql\`raise 'down migration not implemented'\`)
        }
      2000.01.03T00.00.00.typescript789.ts: |
        import {Migration} from '@pgkit/migrator'

        export const up: Migration = async ({context: {connection, sql}}) => {
          await connection.query(sql\`raise 'up migration not implemented'\`)
        }

        export const down: Migration = async ({context: {connection, sql}}) => {
          await connection.query(sql\`raise 'down migration not implemented'\`)
        }
      down:
        2000.01.01T00.00.00.sql123.sql: |
          raise 'down migration not implemented'
    `)
  })
})
