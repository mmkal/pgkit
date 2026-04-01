import {createPool, sql} from '@pgkit/client'
import {beforeAll, afterAll, beforeEach, describe, expect, test} from 'vitest'
import {run as runMigra} from '../src/command'

const connectionString = process.env.MIGRA_TEST_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres'

let admin: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  admin = createPool(connectionString)
})

afterAll(async () => {
  await admin.pgp.$pool.end()
})

async function setupDb(name: string, setupSql: string) {
  await admin.query(sql`drop database if exists ${sql.identifier([name])}`)
  await admin.query(sql`create database ${sql.identifier([name])}`)
  const url = connectionString.replace(/\/[^/]+$/, `/${name}`)
  const pool = createPool(url)
  await pool.query(sql.raw(setupSql))
  await pool.pgp.$pool.end()
  return url
}

async function cleanupDb(name: string) {
  await admin.query(sql`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = ${name} and pid <> pg_backend_pid()
  `)
  await admin.query(sql`drop database if exists ${sql.identifier([name])}`)
}

describe('column order should not cause spurious view diffs', () => {
  const dbA = 'migra_colorder_test_a'
  const dbB = 'migra_colorder_test_b'

  beforeEach(async () => {
    await cleanupDb(dbA)
    await cleanupDb(dbB)
  })

  test('view with explicit columns is not recreated when table column order differs', async () => {
    const a = await setupDb(
      dbA,
      `
      create table users (
        id serial primary key,
        name text not null,
        email text not null
      );
      create view user_emails as select id, email from users;
      `,
    )
    const b = await setupDb(
      dbB,
      `
      create table users (
        id serial primary key,
        email text not null,
        name text not null
      );
      create view user_emails as select id, email from users;
      `,
    )

    const result = await runMigra(a, b, {unsafe: true})
    expect(result.sql.trim()).toBe('')
  })

  test('view with SELECT * is recreated when table column order differs', async () => {
    const a = await setupDb(
      dbA,
      `
      create table users (
        id serial primary key,
        name text not null,
        email text not null
      );
      create view all_users as select * from users;
      `,
    )
    const b = await setupDb(
      dbB,
      `
      create table users (
        id serial primary key,
        email text not null,
        name text not null
      );
      create view all_users as select * from users;
      `,
    )

    const result = await runMigra(a, b, {unsafe: true})
    expect(result.sql).toContain('drop view')
    expect(result.sql).toContain('create or replace view')
  })

  test('view with explicit columns is not recreated even with many reordered columns', async () => {
    const a = await setupDb(
      dbA,
      `
      create table items (
        id serial primary key,
        alpha text,
        beta text,
        gamma text,
        delta text
      );
      create view item_summary as select id, delta, alpha from items;
      `,
    )
    const b = await setupDb(
      dbB,
      `
      create table items (
        id serial primary key,
        delta text,
        gamma text,
        beta text,
        alpha text
      );
      create view item_summary as select id, delta, alpha from items;
      `,
    )

    const result = await runMigra(a, b, {unsafe: true})
    expect(result.sql.trim()).toBe('')
  })
})
