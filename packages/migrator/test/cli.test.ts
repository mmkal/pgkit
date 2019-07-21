import {statSync, readdirSync, unlinkSync, writeFileSync, existsSync} from 'fs'
import {join} from 'path'
import {range} from 'lodash'
import {createPool, sql} from 'slonik'
import {setupSlonikMigrator} from '../src'

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const walk = (path: string): string[] =>
  statSync(path).isDirectory() ? [].concat(...readdirSync(path).map(child => walk(join(path, child)))) : [path]

const relativeDir = __dirname.replace(process.cwd() + '/', '')

// https://github.com/gajus/slonik/issues/63#issuecomment-500889445
afterAll(() => new Promise(r => setTimeout(r, 1)))

it('migrates', async () => {
  const slonik = createPool('postgresql://postgres:postgres@localhost:5433/postgres', {idleTimeout: 1})
  existsSync(join(relativeDir, 'migrations')) && walk(join(relativeDir, 'migrations')).map(unlinkSync)
  jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => fakeDates.shift())
  await slonik.query(sql`
    drop table if exists migration;
    drop table if exists migration_one;
    drop table if exists migration_two;
  `)

  const log = jest.spyOn(console, 'log').mockImplementation(() => {})
  const migrator = setupSlonikMigrator({
    migrationsPath: __dirname + '/migrations',
    slonik,
  })

  expect(walk(relativeDir)).toHaveLength(1)
  expect(walk(relativeDir)).toMatchInlineSnapshot(`
    Array [
      "packages/migrator/test/cli.test.ts",
    ]
  `)
  migrator.create('one')
  expect(walk(relativeDir)).toMatchInlineSnapshot(`
    Array [
      "packages/migrator/test/cli.test.ts",
      "packages/migrator/test/migrations/2000-01-01T00-00.one.sql",
      "packages/migrator/test/migrations/down/2000-01-01T00-00.one.sql",
    ]
  `)
  migrator.create('two')
  expect(walk(relativeDir).sort()).toMatchInlineSnapshot(`
    Array [
      "packages/migrator/test/cli.test.ts",
      "packages/migrator/test/migrations/2000-01-01T00-00.one.sql",
      "packages/migrator/test/migrations/2000-01-02T00-00.two.sql",
      "packages/migrator/test/migrations/down/2000-01-01T00-00.one.sql",
      "packages/migrator/test/migrations/down/2000-01-02T00-00.two.sql",
    ]
  `)

  const migrationTables = () =>
    slonik.anyFirst(sql`select tablename from pg_catalog.pg_tables where tablename like 'migration%'`)

  expect(await migrationTables()).toEqual([])

  const file = (matcher: RegExp) => walk(relativeDir).find(file => file.match(matcher))
  writeFileSync(file(/one\.sql/), 'create table migration_one(x text)')
  writeFileSync(file(/down.*one\.sql/), 'drop table migration_one')

  writeFileSync(file(/two\.sql/), 'create table migration_two(x text)')
  writeFileSync(file(/down.*two\.sql/), 'drop table migration_two')

  const up1 = await migrator.up()

  expect(up1).toMatchObject([
    {file: expect.stringContaining('one.sql'), path: expect.stringContaining('one.sql')},
    {file: expect.stringContaining('two.sql'), path: expect.stringContaining('two.sql')},
  ])

  expect(await migrationTables()).toEqual(['migration', 'migration_one', 'migration_two'])

  const up2 = await migrator.up()

  expect(up2).toEqual([])

  await migrator.down()

  expect(await migrationTables()).toEqual(['migration', 'migration_one'])

  await migrator.down()

  expect(await migrationTables()).toEqual(['migration'])

  await migrator.down()

  expect(await migrationTables()).toEqual(['migration'])

  const calls = JSON.parse(JSON.stringify(log.mock.calls).replace(/\.\d\d\ds/g, '.001s'))
  expect(calls).toMatchInlineSnapshot(`
    Array [
      Array [
        "migrations in database:",
        Array [],
      ],
      Array [
        "== 2000-01-01T00-00.one: migrating =======",
      ],
      Array [
        "== 2000-01-01T00-00.one: migrated (0.001s)
    ",
      ],
      Array [
        "== 2000-01-02T00-00.two: migrating =======",
      ],
      Array [
        "== 2000-01-02T00-00.two: migrated (0.001s)
    ",
      ],
      Array [
        "== 2000-01-02T00-00.two: reverting =======",
      ],
      Array [
        "== 2000-01-02T00-00.two: reverted (0.001s)
    ",
      ],
      Array [
        "== 2000-01-01T00-00.one: reverting =======",
      ],
      Array [
        "== 2000-01-01T00-00.one: reverted (0.001s)
    ",
      ],
    ]
  `)
})
