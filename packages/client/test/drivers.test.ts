import {expect, test} from 'vitest'
import {createClient, createPgDriver, createPostgresDriver, sql} from '../src'

const connectionString = 'postgresql://postgres:postgres@localhost:5432/postgres'

test('pg driver', async () => {
  const client = createClient(connectionString, {
    driver: createPgDriver({application_name: 'pg-driver'}),
  })

  try {
    await expect(client.one(sql`select 1 as value`)).resolves.toEqual({value: 1})
    await expect(client.transaction(async tx => tx.one(sql`select 2 as value`))).resolves.toEqual({value: 2})
  } finally {
    await client.end()
  }
})

test('postgres driver', async () => {
  const client = createClient(connectionString, {
    driver: createPostgresDriver({application_name: 'postgres-driver'}),
  })

  try {
    await expect(client.one(sql`select 1 as value`)).resolves.toEqual({value: 1})
    await expect(
      client.connect(async conn => conn.transaction(async tx => tx.one(sql`select 3 as value`))),
    ).resolves.toEqual({value: 3})
  } finally {
    await client.end()
  }
})
