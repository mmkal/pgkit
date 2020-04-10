import {statSync, readdirSync, unlinkSync, writeFileSync, existsSync} from 'fs'
import {join} from 'path'
import {range} from 'lodash'
import {createPool, sql} from 'slonik'
import {setupSlonikMigrator} from '../src'
import * as dedent from 'dedent'
import {inspect} from 'util'
import {EOL} from 'os'

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const walk_ = (path: string): string[] =>
  statSync(path).isDirectory() ? [].concat(...readdirSync(path).map(child => walk_(join(path, child)))) : [path]
const walk: typeof walk_ = path => walk_(path).map(replaceBackslashes)

const replaceBackslashes = (path: string) => path.split('\\').join('/')
const relativeDir = replaceBackslashes(__dirname).replace(replaceBackslashes(process.cwd()) + '/', '')

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
    drop table if exists migration_three;
    drop table if exists migration_four;
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

  migrator.create('three.js')
  expect(walk(relativeDir).sort()).toMatchInlineSnapshot(`
    Array [
      "packages/migrator/test/cli.test.ts",
      "packages/migrator/test/migrations/2000-01-01T00-00.one.sql",
      "packages/migrator/test/migrations/2000-01-02T00-00.two.sql",
      "packages/migrator/test/migrations/2000-01-03T00-00.three.js",
      "packages/migrator/test/migrations/down/2000-01-01T00-00.one.sql",
      "packages/migrator/test/migrations/down/2000-01-02T00-00.two.sql",
    ]
  `)

  migrator.create('four.ts')
  expect(walk(relativeDir).sort()).toMatchInlineSnapshot(`
Array [
  "packages/migrator/test/cli.test.ts",
  "packages/migrator/test/migrations/2000-01-01T00-00.one.sql",
  "packages/migrator/test/migrations/2000-01-02T00-00.two.sql",
  "packages/migrator/test/migrations/2000-01-03T00-00.three.js",
  "packages/migrator/test/migrations/2000-01-04T00-00.four.ts",
  "packages/migrator/test/migrations/down/2000-01-01T00-00.one.sql",
  "packages/migrator/test/migrations/down/2000-01-02T00-00.two.sql",
]
`)

  const migrationTables = async () =>
    new Set(await slonik.anyFirst(sql`select tablename from pg_catalog.pg_tables where tablename like 'migration%'`))

  expect(await migrationTables()).toEqual(new Set([]))

  const file = (matcher: RegExp) => walk(relativeDir).find(file => file.match(matcher))
  writeFileSync(file(/one\.sql/), 'create table migration_one(x text)')
  writeFileSync(file(/down.*one\.sql/), 'drop table migration_one')

  writeFileSync(file(/two\.sql/), 'create table migration_two(x text)')
  writeFileSync(file(/down.*two\.sql/), 'drop table migration_two')

  writeFileSync(
    file(/three\.js/),
    dedent`
      module.exports.up = ({slonik, sql}) => slonik.query(sql\`create table migration_three(x text)\`)
      module.exports.down = ({slonik, sql}) => slonik.query(sql\`drop table migration_three\`)
    ` + EOL,
  )

  writeFileSync(
    file(/four\.ts/),
    dedent`
      import {Migration} from '../..'
      
      export const up: Migration = ({slonik, sql}) => slonik.query(sql\`create table migration_four(x text)\`)
      export const down: Migration = ({slonik, sql}) => slonik.query(sql\`drop table migration_four\`)
    ` + EOL,
  )

  const up1 = await migrator.up()

  expect(up1).toMatchObject([
    {file: expect.stringContaining('one.sql'), path: expect.stringContaining('one.sql')},
    {file: expect.stringContaining('two.sql'), path: expect.stringContaining('two.sql')},
    {file: expect.stringContaining('three.js'), path: expect.stringContaining('three.js')},
    {file: expect.stringContaining('four.ts'), path: expect.stringContaining('four.ts')},
  ])

  const up2 = await migrator.up()

  expect(up2).toEqual([])

  const expectedTables = ['migration_one', 'migration_two', 'migration_three', 'migration_four']

  expect(await migrationTables()).toEqual(new Set(['migration', ...expectedTables]))

  for (let i = expectedTables.length + 1; i >= 0; i--) {
    await migrator.down()
    expectedTables.pop()
    expect(await migrationTables()).toEqual(new Set(['migration', ...expectedTables]))
  }

  const calls = JSON.parse(JSON.stringify(log.mock.calls).replace(/\.\d\d\ds/g, '.001s')).map(call => inspect(call))
  expect(calls).toMatchInlineSnapshot(`
    Array [
      "[ 'migrations in database:', [] ]",
      "[ '== 2000-01-01T00-00.one: migrating =======' ]",
      "[ '== 2000-01-01T00-00.one: migrated (0.001s)\\\\n' ]",
      "[ '== 2000-01-02T00-00.two: migrating =======' ]",
      "[ '== 2000-01-02T00-00.two: migrated (0.001s)\\\\n' ]",
      "[ '== 2000-01-03T00-00.three: migrating =======' ]",
      "[ '== 2000-01-03T00-00.three: migrated (0.001s)\\\\n' ]",
      "[ '== 2000-01-04T00-00.four: migrating =======' ]",
      "[ '== 2000-01-04T00-00.four: migrated (0.001s)\\\\n' ]",
      "[ '== 2000-01-04T00-00.four: reverting =======' ]",
      "[ '== 2000-01-04T00-00.four: reverted (0.001s)\\\\n' ]",
      "[ '== 2000-01-03T00-00.three: reverting =======' ]",
      "[ '== 2000-01-03T00-00.three: reverted (0.001s)\\\\n' ]",
      "[ '== 2000-01-02T00-00.two: reverting =======' ]",
      "[ '== 2000-01-02T00-00.two: reverted (0.001s)\\\\n' ]",
      "[ '== 2000-01-01T00-00.one: reverting =======' ]",
      "[ '== 2000-01-01T00-00.one: reverted (0.001s)\\\\n' ]",
    ]
  `)
})
