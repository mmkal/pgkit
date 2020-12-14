import {setupSlonikMigrator} from '../src'
import * as path from 'path'
import {fsSyncer} from 'fs-syncer'
import {createPool, sql} from 'slonik'

const names = (migrations: Array<{name: string}>) => migrations.map(m => m.name)

const slonik = createPool('postgresql://postgres:postgres@localhost:5433/postgres', {idleTimeout: 1})
afterAll(() => slonik.end())

describe('error messages', () => {
  test('include migration name', async () => {
    const baseDir = path.join(__dirname, 'generated/errors')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table errors_test_table(id int primary key;)', // syntax error, semicolon on wrong side of parens
      },
    })
    syncer.sync()

    await slonik.query(sql`drop table if exists errors_test_table`)
    await slonik.query(sql`drop table if exists errors_migrations`)

    const migrator = setupSlonikMigrator({
      slonik,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'errors_migrations',
      logger: undefined,
    })

    expect(await migrator.pending().then(names)).toEqual(['m1.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Migration m1.sql (up) failed: Original error: syntax error at or near \\";\\""`,
    )
  })

  test('error creating table', async () => {
    const baseDir = path.join(__dirname, 'generated/errors-with-create-table')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table errors_table1(id int primary key)',
        'm2.sql': 'insert into errors_table1(id) values (1)',
        'm3.sql': 'create table errors_table2(id int primary key;)', // syntax error, semicolon on wrong side of parens
      },
    })
    syncer.sync()

    await slonik.query(sql`drop table if exists errors_table1`)
    await slonik.query(sql`drop table if exists errors_table2`)
    await slonik.query(sql`drop table if exists errors_migrations2`)

    const migrator = setupSlonikMigrator({
      slonik,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'errors_migrations2',
      logger: undefined,
    })

    // expect(await migrator.pending().then(names)).toEqual(['m1.sql', 'm2.sql', 'm3.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Migration m3.sql (up) failed: Original error: syntax error at or near \\";\\""`,
    )

    expect(await slonik.any(sql`select * from errors_table1`).catch(e => e)).toMatchInlineSnapshot(
      `[error: relation "errors_table1" does not exist]`,
    )
    expect(await slonik.any(sql`select * from errors_migrations2`)).toMatchInlineSnapshot(`Array []`)
  })
})
