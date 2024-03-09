import {createClient, sql} from '@pgkit/client'
import {PostgreSQL} from '@pgkit/schemainspect'
import {readFileSync} from 'fs'
import {expect, test} from 'vitest'

test('seed', async () => {
  const dbName = 'admin_test'
  const admin = createClient('postgresql://postgres:postgres@localhost:5432/postgres')
  await admin.query(sql`drop database if exists ${sql.identifier([dbName])}`)
  await admin.query(sql`create database ${sql.identifier([dbName])}`)

  const query = readFileSync(__dirname + '/definition.sql').toString()

  const client = createClient(`postgresql://postgres:postgres@localhost:5432/${dbName}`)

  await client.query(sql.raw(query))

  const inspector = await PostgreSQL.create(client)
  const json = JSON.stringify(inspector, null, 2)

  await expect(json).toMatchFileSnapshot('__snapshots__/seed.json')

  await admin.end()
  await client.end()
})
