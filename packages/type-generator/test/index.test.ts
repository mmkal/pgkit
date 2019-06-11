import {setupSlonikTs} from '../src'
import {knownTypes} from './db'
import {createPool} from 'slonik'
import {statSync, readdirSync, existsSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os';
import { expectType, TypeOf, TypeEqual } from 'ts-expect'

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
        'CountInfo.ts',
        'Foo.ts',
        'index.ts',
      ]
    `)
  })

  it('creates a pessimistic union type when there are multiple queries', async () => {
    const foo1 = await slonik.any(sql.FooSubset`select a, b, c from foo`)
    const foo2 = await slonik.any(sql.FooSubset`select a, b from foo`)
    expectType<TypeEqual<{a: string, b: boolean}, typeof foo1[0]>>(true)
    expectType<TypeEqual<{a: string, b: boolean}, typeof foo2[0]>>(true)
    expect(foo1).toHaveLength(foo2.length)
  })

  it('can create a prod version', () => {
    expect(Object.keys(setupSlonikTs({knownTypes}))).toMatchInlineSnapshot(`
      Array [
        'interceptor',
        'sql',
      ]
    `)
  })

  it('can create generated types directory', async () => {
    const tempTypesDirectory = join(tmpdir(), 'subdir' + Math.random())
    expect(existsSync(tempTypesDirectory)).toBe(false)
    const {sql, interceptor} = setupSlonikTs({knownTypes: {}, writeTypes: tempTypesDirectory})
    expect(existsSync(tempTypesDirectory)).toBe(true)
    expect(readdirSync(tempTypesDirectory)).toEqual(['index.ts'])

    const slonik = createPool(connectionString, {
      interceptors: [interceptor],
      idleTimeout: 1,
    })
    await slonik.query(sql.Id`select id from foo`)

    expect(readdirSync(tempTypesDirectory).sort()).toEqual(['index.ts', 'Id.ts'].sort())
  })
})
