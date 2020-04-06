import {createPool, sql} from 'slonik'
import {setupSlonikMigrator} from '../src'
import {mkdirSync, writeFileSync} from 'fs'

afterAll(() => new Promise(r => setTimeout(r, 1)))

jest.spyOn(console, 'log').mockImplementation(() => {})

it('can create databases and users in migrations', async () => {
  const migrationsDirName = 'create-db-migrations'
  const migrationsPath = __dirname + '/' + migrationsDirName

  mkdirSync(migrationsPath, {recursive: true})

  const migrations = [
    ['2000-01-01.db.sql', `create database mydb`],
    ['2000-01-02.user.sql', `create user myuser with encrypted password 'mypassword'`],
    ['2000-01-03.grant.sql', `grant all privileges on database mydb to myuser`],
  ]

  migrations.forEach(([name, content]) => {
    writeFileSync(`${migrationsPath}/${name}`, content, 'utf8')
  })

  const slonik = createPool('postgresql://postgres:postgres@localhost:5433/postgres', {idleTimeout: 1})

  await slonik.query(sql`drop table if exists create_db_migration`)
  await slonik.query(sql`drop database if exists mydb`)
  await slonik.query(sql`drop user if exists myuser`)

  const migrator = setupSlonikMigrator({
    migrationsPath,
    migrationTableName: 'create_db_migration',
    slonik,
  })

  expect(await slonik.maybeOneFirst(sql`select datname from pg_database where datname = 'mydb'`)).toEqual(null)
  expect(await slonik.maybeOneFirst(sql`select usename from pg_user where usename = 'myuser'`)).toEqual(null)

  await migrator.up()

  expect(await slonik.maybeOneFirst(sql`select datname from pg_database where datname = 'mydb'`)).toEqual('mydb')
  expect(await slonik.maybeOneFirst(sql`select usename from pg_user where usename = 'myuser'`)).toEqual('myuser')
})
