import {SlonikMigrator} from '../src'
import * as path from 'path'
import {fsSyncer} from 'fs-syncer'
import {createPool, sql} from 'slonik'
import {getTestPool} from './pool'
// const slonik = createPool('postgresql://postgres:postgres@localhost:5433/postgres', {idleTimeout: 1})

// const names = (migrations: Array<{name: string}>) => migrations.map(m => m.name)

// afterAll(() => slonik.end())

const {pool, names, ...helper} = getTestPool({__filename})

describe('transaction', () => {
  test('rollback happens', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.schemaName, 'singleTransaction')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'insert into transaction_test_table(id) values (1);',
        'm2.sql': 'insert into transaction_test_table(id) values (1);', // will fail due to conflict with previous
      },
    })
    syncer.sync()

    await pool.query(sql`drop table if exists transaction_test_table`)
    await pool.query(sql`create table transaction_test_table(id int primary key)`)

    const migrator = new SlonikMigrator({
      slonik: pool,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'transaction_migrations',
      logger: undefined,
      singleTransaction: true,
    })

    expect(await migrator.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Migration m2.sql (up) failed: Original error: Query violates a unique integrity constraint. duplicate key value violates unique constraint \\"transaction_test_table_pkey\\""`,
    )

    await expect(pool.any(sql`select * from transaction_test_table`)).resolves.toEqual([])
    await expect(pool.any(sql`select * from transaction_migrations`)).resolves.toEqual([])

    await expect(migrator.executed().then(names)).resolves.toEqual([])
  })

  test('global transactions disabled by default', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.schemaName, 'disabledTransactions')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'insert into disabled_transaction_test_table(id) values (1);',
        'm2.sql': 'insert into disabled_transaction_test_table(id) values (1);', // will fail due to conflict with previous
      },
    })
    syncer.sync()

    await pool.query(sql`create table disabled_transaction_test_table(id int primary key)`)

    const migrator = new SlonikMigrator({
      slonik: pool,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'disabled_transaction_migrations',
      logger: undefined,
    })

    expect(await migrator.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Migration m2.sql (up) failed: Original error: Query violates a unique integrity constraint. duplicate key value violates unique constraint \\"disabled_transaction_test_table_pkey\\""`,
    )

    await expect(pool.any(sql`select id from disabled_transaction_test_table`)).resolves.toEqual([{id: 1}])
    await expect(pool.any(sql`select name from disabled_transaction_migrations`)).resolves.toEqual([{name: 'm1.sql'}])

    await expect(migrator.executed().then(names)).resolves.toEqual(['m1.sql'])
  })
})
