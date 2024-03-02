import {sql} from '@pgkit/client'
import {fsSyncer} from 'fs-syncer'
import * as path from 'path'
import {describe, expect, test} from 'vitest'
import {Migrator} from './migrator'
import {getPoolHelper, getPoolHelper2} from './pool-helper'

describe('transaction', () => {
  const {pool, names, ...helper} = getPoolHelper({__filename})
  test('rollback happens', async () => {
    await pool.query(sql`drop table if exists rollback_happens`)
    await pool.query(sql`create table rollback_happens(id int primary key)`)

    const baseDir = path.join(__dirname, 'generated', helper.id, 'singleTransaction')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'insert into rollback_happens(id) values (1);',
        'm2.sql': 'insert into rollback_happens(id) values (1);',
        //         ^-- will fail due to conflict with previous migration
      },
    })
    syncer.sync()

    const migrator = new Migrator({
      client: pool,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'rollback_happens_migrations',
    })

    expect(await migrator.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: up migration failed: Migration m2.sql (up) failed: Original error: [Query insert-rollback_happens_f3252ca]: duplicate key value violates unique constraint "rollback_happens_pkey"]`,
    )

    await expect(pool.any(sql`select * from rollback_happens`)).resolves.toEqual([])
    await expect(pool.any(sql`select * from rollback_happens_migrations`)).resolves.toEqual([])

    await expect(migrator.executed().then(names)).resolves.toEqual([])
  })
})

describe('global', () => {
  const {pool, names, ...helper} = getPoolHelper2('global_tx_disabled')
  test('global transactions can be disabled', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.schemaName, 'disabledTransactions')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'insert into disabled_transaction_test_table(id) values (1);',
        'm2.sql': 'insert into disabled_transaction_test_table(id) values (1);', // will fail due to conflict with previous
      },
    })
    syncer.sync()

    await pool.query(sql`
      drop table if exists disabled_transaction_test_table;
      create table disabled_transaction_test_table(id int primary key);
    `)

    const migrator = new Migrator({
      client: pool,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'disabled_transaction_migrations',
      connectMethod: 'connect',
    })

    expect(await migrator.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: up migration failed: Migration m2.sql (up) failed: Original error: [Query insert-disabled_transaction_test_table_091833d]: duplicate key value violates unique constraint "disabled_transaction_test_table_pkey"]`,
    )

    await expect(pool.any(sql`select id from disabled_transaction_test_table`)).resolves.toEqual([{id: 1}])
    await expect(pool.any(sql`select name from disabled_transaction_migrations`)).resolves.toEqual([{name: 'm1.sql'}])

    await expect(migrator.executed().then(names)).resolves.toEqual(['m1.sql'])
  })
})
