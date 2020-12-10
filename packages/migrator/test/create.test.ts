import {join} from 'path'
import {range} from 'lodash'
import {createPool, sql} from 'slonik'
import {setupSlonikMigrator} from '../src'
import {fsSyncer} from 'fs-syncer'
import * as jsYaml from 'js-yaml'

const slonik = createPool('postgresql://postgres:postgres@localhost:5433/postgres', {idleTimeout: 1})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = jest.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

expect.addSnapshotSerializer({
  test: val => val && typeof val === 'object',
  print: val => jsYaml.safeDump(val),
})

describe('create', () => {
  const syncer = fsSyncer(join(__dirname, 'generated/create/migrations'), {})

  const migrator = setupSlonikMigrator({
    slonik,
    migrationsPath: syncer.baseDir,
    migrationTableName: 'migration',
    logger: undefined,
  })

  beforeEach(() => {
    syncer.sync()
    toISOSpy.mockClear()
  })

  afterAll(syncer.sync)

  test('creates sql, js and ts files', async () => {
    await migrator.create({name: 'sql.sql'})
    await migrator.create({name: 'javascript.js'})
    await migrator.create({name: 'typescript.ts'})

    await expect(migrator.create({name: 'text.txt'})).rejects.toThrowError(/Extension .txt not allowed./)

    expect(syncer.read()).toMatchInlineSnapshot(`
      2000.01.01T00.00.00.sql.sql: |
        raise 'up migration not implemented'
      2000.01.02T00.00.00.javascript.js: |
        /** @type {import('@sloink/migrator').Migration} */
        exports.up = async ({slonik, sql}) => {
          await slonik.query(sql\`raise 'up migration not implemented'\`)
        }

        /** @type {import('@sloink/migrator').Migration} */
        exports.down = async ({slonik, sql}) => {
          await slonik.query(sql\`raise 'down migration not implemented'\`)
        }
      2000.01.03T00.00.00.typescript.ts: |
        import {Migration} from '@slonik/migrator'

        export const up: Migration = async ({slonik, sql}) => {
          await slonik.query(sql\`raise 'up migration not implemented'\`)
        }

        export const down: Migration = async ({slonik, sql}) => {
          await slonik.query(sql\`raise 'down migration not implemented'\`)
        }
      down:
        2000.01.01T00.00.00.sql.sql: |
          raise 'down migration not implemented'

    `)
  })
})

// https://github.com/gajus/slonik/issues/63#issuecomment-500889445
afterAll(() => slonik.end())
