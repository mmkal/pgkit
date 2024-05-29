import {fsSyncer} from 'fs-syncer'
import * as path from 'path'
import {describe, expect, test, vi as jest} from 'vitest'
import {Migrator} from './migrator'
import {getPoolHelper2} from './pool-helper'

const names = (migrations: Array<{name: string}>) => migrations.map(m => m.name)

describe('locking', () => {
  const helper = getPoolHelper2('locking_basic')
  test('second instance waits for first', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.id, 'wait')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table locking_test_table(id int primary key);',
        'm2.sql': 'select pg_sleep(0.1); insert into locking_test_table(id) values (1);', // runs slowly, and fails if it's run twice
        down: {
          'm1.sql': 'drop table locking_test_table;',
          'm2.sql': 'delete from locking_test_table where id = 1;',
        },
      },
    })
    syncer.sync()

    const migrator = () =>
      new Migrator({
        client: helper.pool,
        migrationsPath: path.join(syncer.baseDir, 'migrations'),
        migrationTableName: 'locking_migrations',
      })

    const [m1, m2] = [migrator(), migrator()]

    expect(await m1.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    // watch for the second instance applying migrations - if it tries to, the locking mechanism isn't working
    const m2MigratingSpy = jest.fn()
    m2.on('migrating', m2MigratingSpy)

    // when the first instance has started, kick off the second concurrently
    const promise2 = m1.once('migrating').then(async () => m2.up())
    const promise1 = m1.up()

    // const promise2 = m2.up()

    await expect(promise1.then(names)).resolves.toEqual(['m1.sql', 'm2.sql'])
    await expect(promise2.then(names)).resolves.toEqual([])

    expect(m2MigratingSpy).not.toHaveBeenCalled()

    expect(await migrator().executed().then(names)).toEqual(['m1.sql', 'm2.sql'])
  })

  test(`singleTransaction doesn't prevent unlock`, async () => {
    const baseDir = path.join(__dirname, 'generated', helper.id, 'singleTransaction')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table transaction_unlock(id int primary key);',
        'm2.sql': 'this is a syntax error',
      },
    })
    syncer.sync()

    const migrator = new Migrator({
      client: helper.pool,
      migrationsPath: path.join(syncer.baseDir, 'migrations'),
      migrationTableName: 'locking_transaction_migrations',
      logger: helper.mockLogger,
    })

    expect(await migrator.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    await expect(migrator.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Applying m2.sql failed: Error: [Query sql_90ed2eb]: syntax error at or near "this"]`,
    )

    expect(helper.mockLogger.error).not.toHaveBeenCalled()

    const {took} = await migrator.waitForAdvisoryLock()
    expect(took).toBeLessThan(500)

    expect(await migrator.pending().then(names)).toEqual(['m1.sql', 'm2.sql']) // would time out if advisory lock was still held
  })
})

describe('concurrency', () => {
  const helper = getPoolHelper2('locking_concurrency', {lockTimeout: '50ms'})

  test('local lock timeout', async () => {
    const baseDir = path.join(__dirname, 'generated', helper.id, 'localLockTimeout')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table lock_timeout_test_table(id int primary key);',
        'm2.sql': 'select pg_sleep(0.1); insert into lock_timeout_test_table(id) values (1);', // runs slowly, and fails if it's run twice
        down: {
          'm1.sql': 'drop table lock_timeout_test_table;',
          'm2.sql': 'delete from lock_timeout_test_table where id = 1;',
        },
      },
    })
    syncer.sync()

    const migrator = () =>
      new Migrator({
        client: helper.pool,
        migrationsPath: path.join(syncer.baseDir, 'migrations'),
        migrationTableName: 'migrations',
      })

    const [m1, m2] = [migrator(), migrator()]

    expect(await m1.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    // watch for the second instance applying migrations - if it tries to, the locking mechanism isn't working
    const m2MigratingSpy = jest.fn()
    m2.on('migrating', m2MigratingSpy)

    const [r1, r2] = await Promise.allSettled([m1.up(), m1.once('migrating').then(async () => m2.up())])

    expect(r2).toMatchInlineSnapshot(
      {status: 'rejected'},
      `
        {
          "reason": [Error: up migration failed: [Query select_059ad74]: canceling statement due to lock timeout],
          "status": "rejected",
        }
      `,
    )

    expect(r1.status === 'fulfilled' ? names(r1.value) : r1).toEqual(['m1.sql', 'm2.sql'])

    expect(m2MigratingSpy).not.toHaveBeenCalled()

    expect(await migrator().executed().then(names)).toEqual(['m1.sql', 'm2.sql'])
  })

  test(`single instance doesn't try to run concurrently`, async () => {
    const baseDir = path.join(__dirname, 'generated', helper.id, 'noConcurrentRuns')
    const syncer = fsSyncer(baseDir, {
      migrations: {
        'm1.sql': 'create table lock_timeout_test_table(id int primary key);',
        'm2.sql': 'select pg_sleep(0.05); insert into lock_timeout_test_table(id) values (1);', // runs slowly, and fails if it's run twice
        down: {
          'm1.sql': 'drop table lock_timeout_test_table;',
          'm2.sql': 'delete from lock_timeout_test_table where id = 1;',
        },
      },
    })
    syncer.sync()

    const migrator = () =>
      new Migrator({
        client: helper.pool,
        migrationsPath: path.join(syncer.baseDir, 'migrations'),
        migrationTableName: 'migrations',
        logger: helper.mockLogger,
      })

    const [m1, m2] = [migrator(), migrator()]
    m2.lockWarningMs = 20 // normally this would be 1000, this makes the test faster

    expect(await m1.pending().then(names)).toEqual(['m1.sql', 'm2.sql'])

    const promise1 = m1.up()

    // watch for the second instance applying migrations - if it tries to, the locking mechanism isn't working
    const m2MigratingSpy = jest.fn()
    m2.on('migrating', m2MigratingSpy)

    await m1.once('migrating')

    // now that the first instance has started, kick off the second concurrently
    await expect(m2.up()).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: up migration failed: [Query select_059ad74]: canceling statement due to lock timeout]`,
    )

    await expect(promise1.then(names)).resolves.toEqual(['m1.sql', 'm2.sql'])

    expect(m2MigratingSpy).not.toHaveBeenCalled()

    expect(await migrator().executed().then(names)).toEqual(['m1.sql', 'm2.sql'])

    expect(helper.mockLogger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining(
        `Waiting for lock. This may mean another process is simultaneously running migrations. You may want to issue a command like "set lock_timeout = '10s'" if this happens frequently. Othrewise, this command may wait until the process is killed.`,
      ),
    })
  })
})
