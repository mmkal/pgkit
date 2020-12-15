import {setupSlonikMigrator, SlonikMigrator} from '../src'
import * as path from 'path'
import {fsSyncer} from 'fs-syncer'
import {sql} from 'slonik'
import {getPoolHelper} from './pool-helper'

const names = (migrations: Array<{name: string}>) => migrations.map(m => m.name)

describe('locking', () => {
  const helper = getPoolHelper({__filename})
  test('second instance waits for first', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.schemaName, 'wait')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table locking_test_table(id int primary key);',
        'm2.sql': 'select pg_sleep(3); insert into locking_test_table(id) values (1);', // runs slowly, and fails if it's run twice
        down: {
          'm1.sql': 'drop table locking_test_table;',
          'm2.sql': 'delete from locking_test_table where id = 1;',
        },
      },
    })
    syncer.sync()

    const migrator = () =>
      new SlonikMigrator({
        slonik: helper.pool,
        migrationsPath: path.join(syncer.baseDir, 'migrations'),
        migrationTableName: 'locking_migrations',
        logger: undefined,
      })

    const [m1, m2] = [migrator(), migrator()]

    expect(await m1.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    const promise1 = m1.up()

    // watch for the second instance applying migrations - if it tries to, the locking mechanism isn't working
    const m2MigratingSpy = jest.fn()
    m2.on('migrating', m2MigratingSpy)

    await m1.once('migrating')

    // now that the first instance has started, kick off the second concurrently
    const promise2 = m2.up()

    await expect(promise1.then(names)).resolves.toEqual(['m1.sql', 'm2.sql'])
    await expect(promise2.then(names)).resolves.toEqual([])

    expect(m2MigratingSpy).not.toHaveBeenCalled()

    expect(await migrator().executed().then(names)).toEqual(['m1.sql', 'm2.sql'])
  })
})

describe('concurrency', () => {
  const helper = getPoolHelper({
    __filename,
    config: {
      interceptors: [
        {
          afterPoolConnection: async (context, connection) => {
            await connection.query(sql`set lock_timeout = '1s'`)
            return null
          },
        },
      ],
    },
  })

  test('local lock timeout', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.schemaName, 'localLockTimeout')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table lock_timeout_test_table(id int primary key);',
        'm2.sql': 'select pg_sleep(3); insert into lock_timeout_test_table(id) values (1);', // runs slowly, and fails if it's run twice
        down: {
          'm1.sql': 'drop table lock_timeout_test_table;',
          'm2.sql': 'delete from lock_timeout_test_table where id = 1;',
        },
      },
    })
    syncer.sync()

    const migrator = () =>
      new SlonikMigrator({
        slonik: helper.pool,
        migrationsPath: path.join(syncer.baseDir, 'migrations'),
        migrationTableName: 'migrations',
        logger: undefined,
        singleTransaction: true,
      })

    const [m1, m2] = [migrator(), migrator()]

    expect(await m1.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    const promise1 = m1.up()

    // watch for the second instance applying migrations - if it tries to, the locking mechanism isn't working
    const m2MigratingSpy = jest.fn()
    m2.on('migrating', m2MigratingSpy)

    await m1.once('migrating')

    // now that the first instance has started, kick off the second concurrently
    await expect(m2.up()).rejects.toThrowErrorMatchingInlineSnapshot(`"canceling statement due to lock timeout"`)

    await expect(promise1.then(names)).resolves.toEqual(['m1.sql', 'm2.sql'])

    expect(m2MigratingSpy).not.toHaveBeenCalled()

    expect(await migrator().executed().then(names)).toEqual(['m1.sql', 'm2.sql'])
  })

  test(`single instance doesn't try to run concurrently`, async () => {
    const baseDir = path.join(__dirname, 'generated', helper.schemaName, 'noConcurrentRuns')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table lock_timeout_test_table(id int primary key);',
        'm2.sql': 'select pg_sleep(3); insert into lock_timeout_test_table(id) values (1);', // runs slowly, and fails if it's run twice
        down: {
          'm1.sql': 'drop table lock_timeout_test_table;',
          'm2.sql': 'delete from lock_timeout_test_table where id = 1;',
        },
      },
    })
    syncer.sync()

    const migrator = () =>
      new SlonikMigrator({
        slonik: helper.pool,
        migrationsPath: path.join(syncer.baseDir, 'migrations'),
        migrationTableName: 'migrations',
        logger: undefined,
      })

    const [m1, m2] = [migrator(), migrator()]

    expect(await m1.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    const promise1 = m1.up()

    // watch for the second instance applying migrations - if it tries to, the locking mechanism isn't working
    const m2MigratingSpy = jest.fn()
    m2.on('migrating', m2MigratingSpy)

    await m1.once('migrating')

    // now that the first instance has started, kick off the second concurrently
    await expect(m2.up()).rejects.toThrowErrorMatchingInlineSnapshot(`"canceling statement due to lock timeout"`)

    await expect(promise1.then(names)).resolves.toEqual(['m1.sql', 'm2.sql'])

    expect(m2MigratingSpy).not.toHaveBeenCalled()

    expect(await migrator().executed().then(names)).toEqual(['m1.sql', 'm2.sql'])
  })
})
