import {beforeAll, beforeEach, expect, expectTypeOf, test} from 'vitest'
import {z} from 'zod'
import {createClient, createSqlTag, sql} from '../src'

export let client: Awaited<ReturnType<typeof createClient>>

beforeAll(async () => {
  client = createClient('postgresql://postgres:postgres@localhost:5432/postgres')
})

beforeEach(async () => {
  await client.query(sql`
    drop table if exists usage_test;
    create table usage_test(id int, name text);
    insert into usage_test values (1, 'one'), (2, 'two'), (3, 'three');
  `)
})

test('sql.array', async () => {
  const result = await client.any(sql`
    select *
    from usage_test
    where name = any(${sql.array(['one', 'two'], 'text')})
  `)
  expect(result).toEqual([
    {id: 1, name: 'one'},
    {id: 2, name: 'two'},
  ])
})

test('sql.identifier', async () => {
  const result = await client.oneFirst(sql`
    select count(1)
    from ${sql.identifier(['public', 'usage_test'])}
  `)

  expect(Number(result)).toEqual(3)
})

test('sql.unnest', async () => {
  const entries = [
    {id: 1, name: 'one'},
    {id: 2, name: 'two'},
    {id: 3, name: 'three'},
    {id: 4, name: 'four'},
  ]
  const result = await client.any(sql`
    insert into usage_test(id, name)
    select *
    from ${sql.unnest(
      entries.map(({id, name}) => [id, name]),
      ['int4', 'text'],
    )}
    returning *
  `)

  expect(result).toEqual([
    {id: 1, name: 'one'},
    {id: 2, name: 'two'},
    {id: 3, name: 'three'},
    {id: 4, name: 'four'},
  ])
})

test('sql.join', async () => {
  const [result] = await client.any(sql`
    update usage_test
    set ${sql.join([sql`name = 'one hundred'`, sql`id = 100`], sql`, `)}
    where id = 1
    returning *
  `)

  expect(result).toEqual({id: 100, name: 'one hundred'})
})

test('sql.fragment', async () => {
  const condition = sql.fragment`id = 1`

  const result = await client.one(sql`select * from usage_test where ${condition}`)
  expect(result).toEqual({id: 1, name: 'one'})
})

test('sql.interval', async () => {
  const result = await client.oneFirst(sql`
    select '2000-01-01T12:00:00Z'::timestamptz + ${sql.interval({
      days: 1,
      hours: 1,
    })} as ts
  `)
  expect(result).toBeInstanceOf(Date)
  expect(result).toMatchInlineSnapshot(`2000-01-02T13:00:00.000Z`)

  const interval = await client.oneFirst(sql`select ${sql.interval({days: 1})}`)
  expect(interval).toMatchInlineSnapshot(`"1 day"`)
})

test('sql.binary', async () => {
  const result = await client.oneFirst(sql`
    select ${sql.binary(Buffer.from('hello'))} as b
  `)
  expect(result).toMatchInlineSnapshot(`"\\x68656c6c6f"`)
})

test('sql.json', async () => {
  await client.query(sql`
    drop table if exists jsonb_test;
    create table jsonb_test (id int, data jsonb);
  `)

  const insert = await client.one(sql`
    insert into jsonb_test values (1, ${sql.json({foo: 'bar'})})
    returning *
  `)

  expect(insert).toEqual({data: {foo: 'bar'}, id: 1})
})

test('sql.jsonb', async () => {
  const insert = await client.one(sql`
    insert into jsonb_test values (1, ${sql.jsonb({foo: 'bar'})})
    returning *
  `)

  expect(insert).toEqual({data: {foo: 'bar'}, id: 1})
})

test('JSON.stringify', async () => {
  const insert = await client.one(sql`
    insert into jsonb_test values (1, ${JSON.stringify({foo: 'bar'})})
    returning *
  `)

  expect(insert).toEqual({data: {foo: 'bar'}, id: 1})
})

test('sql.literalValue', async () => {
  const result = await client.transaction(async tx => {
    await tx.query(sql`set local search_path to ${sql.literalValue('abc')}`)
    return tx.one(sql`show search_path`)
  })

  expect(result).toEqual({search_path: 'abc'})
  const result2 = await client.one(sql`show search_path`)
  expect(result2).toEqual({search_path: '"$user", public'})
})

test('sub-transactions', async () => {
  const result = await client.transaction(async t1 => {
    const count1 = await t1.oneFirst(sql`select count(1) from usage_test where id > 3`)
    const count2 = await t1.transaction(async t2 => {
      await t2.query(sql`insert into usage_test(id, name) values (5, 'five')`)
      return t2.oneFirst(sql`select count(1) from usage_test where id > 3`)
    })
    return {count1, count2}
  })

  expect(result).toEqual({count1: 0, count2: 1})
})

test('transaction savepoints', async () => {
  let error: Error | undefined
  await client.transaction(async t1 => {
    await t1.query(sql`insert into usage_test(id, name) values (10, 'ten')`)

    await t1
      .transaction(async t2 => {
        await t2.query(sql`insert into usage_test(id, name) values (11, 'eleven')`)

        throw new Error(`Uh-oh`)
      })
      .catch(e => {
        error = e as Error
      })
  })

  expect(error).toBeInstanceOf(Error)
  expect(error).toMatchInlineSnapshot(`[Error: Uh-oh]`)

  const newRecords = await client.any(sql`select * from usage_test where id >= 10`)
  expect(newRecords).toEqual([{id: 10, name: 'ten'}])
})

test('sql.type', async () => {
  const Fooish = z.object({foo: z.number()})
  await expect(client.one(sql.type(Fooish)`select 1 as foo`)).resolves.toMatchInlineSnapshot(`
    {
      "foo": 1,
    }
  `)

  await expect(client.one(sql.type(Fooish)`select 'hello' as foo`)).rejects.toMatchInlineSnapshot(`
    [Error: [Query select_c2b3cb1]: [
      {
        "code": "invalid_type",
        "expected": "number",
        "received": "string",
        "path": [
          "foo"
        ],
        "message": "Expected number, received string"
      }
    ]]
  `)
})

test('sql.typeAlias', async () => {
  const sql = createSqlTag({
    typeAliases: {
      foo: z.object({
        foo: z.string(),
      }),
    },
  })

  const result = await client.one(sql.typeAlias('foo')`select 'hi' as foo`)
  expectTypeOf(result).toEqualTypeOf<{foo: string}>()
  expect(result).toEqual({foo: 'hi'})

  await expect(client.one(sql.typeAlias('foo')`select 123 as foo`)).rejects.toMatchInlineSnapshot(`
    [Error: [Query select_1534c96]: [
      {
        "code": "invalid_type",
        "expected": "string",
        "received": "number",
        "path": [
          "foo"
        ],
        "message": "Expected string, received number"
      }
    ]]
  `)
})
