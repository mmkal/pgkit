import {setupSlonikMigrator} from '../src'
import * as path from 'path'
import {fsSyncer} from 'fs-syncer'
import {createPool, sql} from 'slonik'

const names = (migrations: Array<{name: string}>) => migrations.map(m => m.name)

const slonik = createPool('postgresql://postgres:postgres@localhost:5433/postgres', {idleTimeout: 1})
afterAll(() => slonik.end())

describe('locking', () => {
  test('second instance waits for first', async () => {
    const baseDir = path.join(__dirname, 'generated/locking')
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

    await slonik.query(sql`drop table if exists locking_test_table`)
    await slonik.query(sql`drop table if exists locking_migrations`)

    const migrator = () =>
      setupSlonikMigrator({
        slonik,
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

describe('set local lock timeout', () => {
  test('second instance times out', async () => {
    const baseDir = path.join(__dirname, 'generated/lock_timeout')
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

    await slonik.query(sql`drop table if exists lock_timeout_test_table`)
    await slonik.query(sql`drop table if exists lock_timeout_migrations`)

    const migrator = () =>
      setupSlonikMigrator({
        slonik: {
          ...slonik,
          transaction: async handler => {
            return slonik.transaction(async transaction => {
              await transaction.query(sql`set local lock_timeout = '1s'`)
              return handler(transaction)
            })
          },
        },
        migrationsPath: path.join(syncer.baseDir, 'migrations'),
        migrationTableName: 'lock_timeout_migrations',
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
