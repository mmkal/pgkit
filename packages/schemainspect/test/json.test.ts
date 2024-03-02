import {createClient, createPool, sql} from '@pgkit/client'
import * as fs from 'fs'
import * as path from 'path'
import {beforeAll, expect, test} from 'vitest'
import {PostgreSQL, SqlbagS} from '../src'

export let admin: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  admin = createPool('postgresql://postgres:postgres@localhost:5432/postgres')
})

test.sequential.each([['collations'], ['everything']] as const)(
  'to/from json %j',
  async name => {
    expect(name).toMatch(/^[\d_a-z]+$/)
    const sqlFile = path.join(__dirname, '../../migra/test/FIXTURES', name, 'b.sql')
    const dbName = `schemainspect_test_${name}`

    await admin.query(sql`drop database if exists ${sql.identifier([dbName])}`)
    await admin.query(sql`create database ${sql.identifier([dbName])}`)

    const connectionString = admin.connectionString().replace(/\/\w+$/, `/${dbName}`)
    const client = createClient(connectionString)

    await client.query(sql.raw(await fs.promises.readFile(sqlFile, 'utf8')))

    const inspector = await PostgreSQL.create(new SqlbagS(connectionString))

    const json = JSON.parse(JSON.stringify(inspector.toJSON()))

    const clone = PostgreSQL.fromJSON(json)

    expect(JSON.parse(JSON.stringify(clone.toJSON()))).toEqual(json)
    const code = `${JSON.stringify(json, null, 2)}\n`
    await expect(code).toMatchFileSnapshot(`./__snapshots__/${name}.json`)

    // const migration = await Migration.create(clone, new SqlbagS(b), {})
    // migration.set_safety(false)
    // migration.add_all_changes()

    // expect(migration.sql.trim()).toEqual('')
  },
  20_000,
)
