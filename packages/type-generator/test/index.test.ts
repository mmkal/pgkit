import {setupSlonikTs} from '../src'
import {knownTypes} from './db'
import {createPool} from 'slonik'
import {statSync, readdirSync} from 'fs'
import {join} from 'path'

describe('type generator', () => {
  const writeTypes = join(__dirname, 'db')
  const {sql, interceptor} = setupSlonikTs({
    knownTypes,
    writeTypes,
  })
  const connectionString = `postgresql://postgres:postgres@localhost:5432/postgres`
  const slonik = createPool(connectionString, {
    idleTimeout: 1,
    interceptors: [interceptor],
  })

  beforeAll(async () => {
    await slonik.query(sql`drop table if exists foo`)
    await slonik.query(sql`
      create table foo(
        id serial primary key,
        a text,
        b boolean,
        c text[],
        d timestamptz,
        e circle -- 'circle' maps to 'unknown' for now
      )
    `)
  })

  // https://github.com/gajus/slonik/issues/63#issuecomment-500889445
  afterAll(() => new Promise(r => setTimeout(r, 0)))

  it('queries', async () => {
    await slonik.query(sql.Foo`select * from foo`)
    await slonik.query(sql.CountInfo`
      select count(*) as a_count, a as a_value
      from foo
      group by a
    `)
    const generatedFiles = readdirSync(writeTypes)
    generatedFiles.forEach(f => {
      expect(statSync(join(writeTypes, f)).mtimeMs).toBeGreaterThan(Date.now() - 2000)
    })
    expect(generatedFiles).toMatchInlineSnapshot(`
      Array [
        "CountInfo.ts",
        "Foo.ts",
        "index.ts",
      ]
    `)
  })

  it('can create a prod version', () => {
    expect(Object.keys(setupSlonikTs({knownTypes}))).toMatchInlineSnapshot(`
      Array [
        "interceptor",
        "sql",
      ]
    `)
  })
})
