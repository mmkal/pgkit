import {sql} from '@pgkit/client'
import {fsSyncer} from 'fs-syncer'
import * as path from 'path'
import {describe, expect, test} from 'vitest'
import {Migrator} from './migrator'
import {getPoolHelper} from './pool-helper'

const helper = getPoolHelper({__filename})

describe('errors', () => {
  test('have helpful messages including migration name', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.id, 'helpfulMessages')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table errors_test_table(id int primary key;)', // syntax error, semicolon on wrong side of parens
      },
    })
    syncer.sync()

    const migrator = new Migrator({
      client: helper.pool,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'errors_migrations',
    })

    expect(await migrator.pending().then(helper.names)).toEqual(['m1.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: up migration failed: Migration m1.sql (up) failed: Original error: [Query create_1488734]: syntax error at or near ";"]`,
    )
  })

  test('error creating table - no transaction', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.id, 'defaultTransactions')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table errors_table1(id int primary key)',
        'm2.sql': 'insert into errors_table1(id) values (1)',
        'm3.sql': 'create table errors_table2(id int primary key;)', // syntax error, semicolon on wrong side of parens
      },
    })
    syncer.sync()

    const migrator = new Migrator({
      client: helper.pool,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'migrations',
      connectMethod: 'connect',
    })

    expect(await migrator.pending().then(helper.names)).toEqual(['m1.sql', 'm2.sql', 'm3.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: up migration failed: Migration m3.sql (up) failed: Original error: [Query create_fe7cef3]: syntax error at or near ";"]`,
    )

    expect(await helper.pool.any(sql`select * from errors_table1`).catch(e => e)).toMatchInlineSnapshot(`
      [
        {
          "id": 1,
        },
      ]
    `)

    expect(await helper.pool.anyFirst(sql`select name from migrations`)).toMatchInlineSnapshot(`
      [
        "m1.sql",
        "m2.sql",
      ]
    `)
  })

  test('error creating table - single transaction', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.id, 'singleTransaction')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table errors_table1(id int primary key)',
        'm2.sql': 'insert into errors_table1(id) values (1)',
        'm3.sql': 'create table errors_table2(id int primary key;)', // syntax error, semicolon on wrong side of parens
      },
    })
    syncer.sync()

    const migrator = new Migrator({
      client: helper.pool,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'migrations',
    })

    expect(await migrator.pending().then(helper.names)).toEqual(['m1.sql', 'm2.sql', 'm3.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: up migration failed: Migration m3.sql (up) failed: Original error: [Query create_fe7cef3]: syntax error at or near ";"]`,
    )

    expect(await helper.pool.any(sql`select * from errors_table1`).catch(e => e)).toMatchInlineSnapshot(
      `[Error: [Query select-errors_table1_24560eb]: relation "errors_table1" does not exist]`,
    )
    expect(await helper.pool.any(sql`select * from migrations`)).toMatchInlineSnapshot(`[]`)
  })
})
