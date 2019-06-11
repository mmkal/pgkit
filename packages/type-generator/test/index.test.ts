import {setupSlonikTs} from '../src'
import {knownTypes} from './db'
import {createPool} from 'slonik'
import {statSync, readdirSync, existsSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {expectType, TypeEqual} from 'ts-expect'

describe('type generator', () => {
  const writeTypes = join(__dirname, 'db')
  const {sql, interceptor} = setupSlonikTs({
    reset: true,
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
    await slonik.query(sql.Foo`select * from foo`) // make sure duplicate doesn't create two types.
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

  it('creates a pessimistic union type when there are multiple queries', async () => {
    const foo1 = await slonik.any(sql.FooSubset`select a, b, c from foo`)
    const foo2 = await slonik.any(sql.FooSubset`select a, b from foo`)
    expectType<{a: string; b: boolean}>(foo1[0])
    expectType<{a: string; b: boolean}>(foo2[0])
    expect(foo1).toHaveLength(foo2.length)
  })

  it('can customise the default type', async () => {
    type DefaultType = {abc: string}
    const {sql, interceptor} = setupSlonikTs({knownTypes: {defaultType: {} as DefaultType}})
    const slonik = createPool(connectionString, {
      idleTimeout: 1,
      interceptors: [interceptor]
    })
    const foo = await slonik.any(sql.FooBar`select * from foo`)
    expectType<{abc: string}>(foo[0])
    expect(foo).toEqual([])
  })

  it('can create a prod version', () => {
    expect(Object.keys(setupSlonikTs({knownTypes}))).toMatchInlineSnapshot(`
      Array [
        "interceptor",
        "sql",
      ]
    `)
  })

  it('can create generated types directory', async () => {
    const tempDir = join(tmpdir(), 'test')
    const {sql, interceptor} = setupSlonikTs({reset: true, knownTypes: {}, writeTypes: tempDir})
    expect(existsSync(tempDir)).toBe(true)
    expect(readdirSync(tempDir)).toEqual(['index.ts'])

    const slonik = createPool(connectionString, {
      interceptors: [interceptor],
      idleTimeout: 1,
    })
    await slonik.query(sql.Id`select id from foo`)

    expect(readdirSync(tempDir).sort()).toEqual(['index.ts', 'Id.ts'].sort())
  })
})
