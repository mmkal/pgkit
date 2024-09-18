import {createPool, sql} from '@pgkit/client'
import {beforeAll, describe, expect, test} from 'vitest'
import * as migra from '../src'
import {setup, format, createDB} from './fixtures'

export let admin: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  admin = createPool('postgresql://postgres:postgres@localhost:5432/postgres')
})

describe('prior limitations', () => {
  test('domains', async () => {
    const a = await createDB(admin.connectionString().replace(/postgres$/, 'a'), admin, 'domain_test')
    const b = await createDB(admin.connectionString().replace(/postgres$/, 'b'), admin, 'domain_test')

    await a.pool.query(sql`create domain test_domain as text`)
    await b.pool.query(sql`create domain test_domain as integer`)

    const result = await migra.run(a.pool, b.pool, {unsafe: true})
    expect(result.sql.trim()).toMatchInlineSnapshot(`
      "drop domain "public"."test_domain";

      create domain "public"."test_domain"
      as integer
      null"
    `)
  })
})
