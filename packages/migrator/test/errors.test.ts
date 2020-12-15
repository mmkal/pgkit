import * as path from 'path'
import {fsSyncer} from 'fs-syncer'
import {sql} from 'slonik'
import {getTestPool} from './pool'
import {SlonikMigrator} from '../src'

const {pool: slonik, ...helper} = getTestPool({__filename})

describe('errors', () => {
  test('have helpful messages including migration name', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.schemaName, 'helpfulMessages')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table errors_test_table(id int primary key;)', // syntax error, semicolon on wrong side of parens
      },
    })
    syncer.sync()

    const migrator = new SlonikMigrator({
      slonik,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'errors_migrations',
      logger: undefined,
    })

    expect(await migrator.pending().then(helper.names)).toEqual(['m1.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Migration m1.sql (up) failed: Original error: syntax error at or near \\";\\""`,
    )
  })

  test('error creating table - default transaction behaviour', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.schemaName, 'defaultTransactions')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table errors_table1(id int primary key)',
        'm2.sql': 'insert into errors_table1(id) values (1)',
        'm3.sql': 'create table errors_table2(id int primary key;)', // syntax error, semicolon on wrong side of parens
      },
    })
    syncer.sync()

    const migrator = new SlonikMigrator({
      slonik,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'migrations',
      logger: undefined,
    })

    expect(await migrator.pending().then(helper.names)).toEqual(['m1.sql', 'm2.sql', 'm3.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Migration m3.sql (up) failed: Original error: syntax error at or near \\";\\""`,
    )

    expect(await slonik.any(sql`select * from errors_table1`).catch(e => e)).toMatchInlineSnapshot(`
      Array [
        Object {
          "id": 1,
        },
      ]
    `)

    expect(await slonik.anyFirst(sql`select name from migrations`)).toMatchInlineSnapshot(`
      Array [
        "m1.sql",
        "m2.sql",
      ]
    `)
  })

  test('error creating table - single transaction', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.schemaName, 'singleTransaction')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table errors_table1(id int primary key)',
        'm2.sql': 'insert into errors_table1(id) values (1)',
        'm3.sql': 'create table errors_table2(id int primary key;)', // syntax error, semicolon on wrong side of parens
      },
    })
    syncer.sync()

    const migrator = new SlonikMigrator({
      slonik,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'migrations',
      logger: undefined,
      singleTransaction: true,
    })

    expect(await migrator.pending().then(helper.names)).toEqual(['m1.sql', 'm2.sql', 'm3.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Migration m3.sql (up) failed: Original error: syntax error at or near \\";\\""`,
    )

    expect(await slonik.any(sql`select * from errors_table1`).catch(e => e)).toMatchInlineSnapshot(
      `[error: relation "errors_table1" does not exist]`,
    )
    expect(await slonik.any(sql`select * from migrations`)).toMatchInlineSnapshot(`Array []`)
  })
})
