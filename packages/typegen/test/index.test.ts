import {setupTypeGen} from '../src'
import {knownTypes} from './generated/main'
import {createPool, sql as slonikSql} from 'slonik'
import {statSync, readdirSync, existsSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'
import {expectType, TypeEqual} from 'ts-expect'

describe('type generator', () => {
  const writeTypes = join(__dirname, 'generated/main')
  const {sql, poolConfig} = setupTypeGen({
    reset: true,
    knownTypes,
    writeTypes,
  })
  const connectionString = `postgresql://postgres:postgres@localhost:5432/postgres`
  const slonik = createPool(connectionString, {...poolConfig, idleTimeout: 1})

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
    await slonik.query(sql`insert into foo(a) values('xyz')`)
  })

  // https://github.com/gajus/slonik/issues/63#issuecomment-500889445
  afterAll(() => new Promise(r => setTimeout(r, 0)))

  it('queries', async () => {
    const fooResult = await slonik.one(sql.Foo`select * from foo`)
    // expectType<{
    //   id: number
    //   a: string
    //   b: boolean
    //   c: string[]
    //   d: number
    //   e: unknown
    // }>(fooResult)
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
        "_pg_types.ts",
        "index.ts",
      ]
    `)
  })

  it('creates a pessimistic union type when there are multiple queries', async () => {
    const foo0 = await slonik.one(sql.FooSubset`select a from foo`)
    const foo1 = await slonik.one(sql.FooSubset`select a, b, c from foo`)
    const foo2 = await slonik.one(sql.FooSubset`select a, b from foo`)
    const merged = {...foo0, ...foo1, ...foo2}
    expectType<TypeEqual<'a', keyof typeof merged>>(true)
    expect(foo1).toMatchObject(foo2)
  })

  it('can customise the default type', async () => {
    type DefaultType = {abc: string}
    const {sql, poolConfig} = setupTypeGen({knownTypes: {defaultType: {} as DefaultType}})
    const slonik = createPool(connectionString, {...poolConfig, idleTimeout: 1})
    const foo = await slonik.one(sql.FooBar`select * from foo`)
    expectType<{abc: string}>(foo)
    expect(foo).toMatchInlineSnapshot(`
      Object {
        "a": "xyz",
        "b": null,
        "c": null,
        "d": null,
        "e": null,
        "id": 1,
      }
    `)
  })

  it('does not add interceptors when write types is falsy', () => {
    const {sql, poolConfig} = setupTypeGen({knownTypes})
    expect(typeof sql).toEqual('function')
    expect(typeof sql.FooBarBaz).toEqual('function')
    expect(poolConfig).toMatchInlineSnapshot(`
      Object {
        "interceptors": Array [],
        "typeParsers": Array [],
      }
    `)
  })

  it('adds type parsers when write types is falsy', () => {
    const {sql, poolConfig} = setupTypeGen({
      knownTypes,
      typeMapper: {
        timestamptz: ['Date', v => new Date(v)],
      },
    })
    expect(typeof sql).toEqual('function')
    expect(typeof sql.FooBarBaz).toEqual('function')
    expect(poolConfig).toMatchInlineSnapshot(`
      Object {
        "interceptors": Array [],
        "typeParsers": Array [
          Object {
            "name": "timestamptz",
            "parse": [Function],
          },
        ],
      }
    `)
  })

  it('can create generated types directory', async () => {
    const tempDir = join(tmpdir(), 'test')
    type CustomisedDefaultType = {id?: 'abc'}
    const {sql, poolConfig} = setupTypeGen({
      reset: true,
      knownTypes: {
        defaultType: {} as CustomisedDefaultType
      },
      writeTypes: tempDir
    })
    expect(existsSync(tempDir)).toBe(true)
    expect(readdirSync(tempDir)).toEqual(['index.ts'])

    const slonik = createPool(connectionString, {...poolConfig, idleTimeout: 1})
    const result = await slonik.query(sql.Id`select id from foo`)
    expectType<CustomisedDefaultType>(result.rows[0])

    expect(readdirSync(tempDir).sort()).toEqual(['index.ts', '_pg_types.ts', 'Id.ts'].sort())
  })

  it('allows custom type mappings', async () => {
    const {sql, poolConfig} = setupTypeGen({
      reset: true,
      knownTypes: await import('./generated/with-date').then(x => x.knownTypes),
      writeTypes: join(__dirname, 'generated', 'with-date'),
      typeMapper: {
        timestamptz: ['Date', value => new Date(value)],
      },
    })

    const slonik = createPool(connectionString, {...poolConfig, idleTimeout: 1})

    await slonik.query(sql`insert into foo(d) values(now())`)
    const result = await slonik.one(sql.FooWithDate`select d from foo where d is not null limit 1`)
    expectType<{d: Date}>(result)
    expect(result).toMatchObject({d: expect.any(Date)})
  })

  it('allows custom type mappings with user-defined interfaces', async () => {
    const {sql, poolConfig} = setupTypeGen({
      reset: true,
      knownTypes: await import('./generated/with-custom-date').then(x => x.knownTypes),
      writeTypes: join(__dirname, 'generated', 'with-custom-date'),
      typeMapper: {
        timestamptz: [`import('../../index.test').MyCustomDateType`, value => ({isoString: value})],
      },
    })

    const slonik = createPool(connectionString, {...poolConfig, idleTimeout: 1})

    await slonik.query(sql`insert into foo(d) values(now())`)
    const result = await slonik.one(sql.FooWithDate`select d from foo where d is not null limit 1`)
    expectType<{d: {isoString: string}}>(result)
    expect(result).toMatchObject({d: {isoString: expect.any(String)}})
  })

  it('maps enums', async () => {
    await slonik.query(slonikSql`
      drop table if exists bar;
      do $$ begin
        create type direction as enum('up', 'down');
      exception
        when duplicate_object then null;
      end $$;
      create table bar(dir direction);
      insert into bar(dir) values ('up');
    `)

    const {sql, poolConfig} = setupTypeGen({
      knownTypes,
      writeTypes,
      typeMapper: {
        direction: [`'up' | 'down'`, value => value],
      },
    })
    const slonikWithDirectionMapper = createPool(connectionString, {...poolConfig, idleTimeout: 1})

    const result = await slonikWithDirectionMapper.one(sql.Bar`select * from bar`)
    expectType<'up' | 'down'>(result.dir)
    expect(result).toMatchInlineSnapshot(`
      Object {
        "dir": "up",
      }
    `)
  })
})

export interface MyCustomDateType {
  isoString: string
}
