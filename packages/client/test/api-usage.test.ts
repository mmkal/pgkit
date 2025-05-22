/* eslint-disable @typescript-eslint/no-shadow */
import * as v from 'valibot'
import {beforeAll, beforeEach, expect, expectTypeOf, test, vi} from 'vitest'
import {z} from 'zod'
import {pgkitStorage, createClient, createSqlTag, sql} from '../src'
import {printErrorCompact as printError} from './snapshots'

expect.addSnapshotSerializer({
  test: Boolean,
  print: printError,
})

export let client: Awaited<ReturnType<typeof createClient>>

beforeAll(async () => {
  client = createClient('postgresql://postgres:postgres@localhost:5432/postgres')
})

beforeEach(async () => {
  await client.query(sql`
    drop table if exists usage_test;
    create table usage_test(id int unique, name text);
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

test('nested sql.fragment - exclude from readme', async () => {
  expect(
    await client.anyFirst(sql`
      select id from usage_test
      where name = any(${sql.array(['one', 'two'], 'text')})
    `),
  ).toMatchSnapshot()

  const isInGroupConditionSql = sql.fragment`name = any(${sql.array(['one', 'two'], 'text')})`

  expect(
    await client.anyFirst(sql`
      select id
      from usage_test
      where ${isInGroupConditionSql}
    `),
  ).toMatchSnapshot()
})

test('nested sql.array - exclude from readme', async () => {
  expect(
    await client.anyFirst(sql`
      select id from usage_test
      where name = any(${sql.array(['one', 'two'], 'text')})
    `),
  ).toMatchInlineSnapshot(`
    [
      1,
      2
    ]
  `)

  const isInGroupConditionSql = sql`name = any(${sql.array(['one', 'two'], 'text')})`

  expect(
    await client.anyFirst(sql`
      select id
      from usage_test
      where ${isInGroupConditionSql}
    `),
  ).toMatchInlineSnapshot(`
    [
      1,
      2
    ]
  `)
})

test('deeply nested sql.fragment - exclude from readme', async () => {
  const name2 = sql.fragment`select name from usage_test where id = ${sql`2`}`
  expect(
    await client.anyFirst(sql`
      select id from usage_test
      where name = 'one' or name in (${name2})
    `),
  ).toMatchInlineSnapshot(`
    [
      1,
      2
    ]
  `)

  const isInGroupConditionSql = sql`name = any(${sql.array(['one', 'two'], 'text')})`

  expect(
    await client.anyFirst(sql`
      select id
      from usage_test
      where ${isInGroupConditionSql}
    `),
  ).toMatchInlineSnapshot(`
    [
      1,
      2
    ]
  `)
})

/**
 * String parameters are formatted in as parameters. To use dynamic strings for schema names, table names, etc.
 * you can use `sql.identifier`.
 */
test('sql.identifier', async () => {
  const result = await client.oneFirst(sql`
    select count(1)
    from ${sql.identifier(['public', 'usage_test'])}
  `)

  expect(Number(result)).toEqual(3)
})

/**
 * `sql.unnest` lets you add many rows in a single query, without generating large SQL statements.
 * It also lets you pass arrays of rows, which is more intuitive than arrays of columns.
 */
test('sql.unnest', async () => {
  const values = [
    {id: 11, name: 'eleven'},
    {id: 12, name: 'twelve'},
    {id: 13, name: 'thirteen'},
    {id: 14, name: 'fourteen'},
  ]
  const result = await client.any(sql`
    insert into usage_test(id, name)
    select *
    from ${sql.unnest(
      values.map(({id, name}) => [id, name]),
      ['int4', 'text'],
    )}
    returning *
  `)

  expect(result).toEqual([
    {id: 11, name: 'eleven'},
    {id: 12, name: 'twelve'},
    {id: 13, name: 'thirteen'},
    {id: 14, name: 'fourteen'},
  ])
})

/**
 * `jsonb_populate_recordset` is a PostgreSQL-native alternative to `sql.unnest` which can be used to insert multiple records without re-specify the column names/types.
 */
test('jsonb_populate_recordset', async () => {
  const records = [
    {id: 11, name: 'eleven'},
    {id: 12, name: 'twelve'},
    {id: 13, name: 'thirteen'},
    {id: 14, name: 'fourteen'},
  ]
  const result = await client.any(sql`
    insert into usage_test
    select *
    from jsonb_populate_recordset(
      null::usage_test,
      ${JSON.stringify(records, null, 2)}
    )
    returning *
  `)

  expect(result).toEqual([
    {id: 11, name: 'eleven'},
    {id: 12, name: 'twelve'},
    {id: 13, name: 'thirteen'},
    {id: 14, name: 'fourteen'},
  ])
})

/**
 * `jsonb_to_recordset` is a PostgreSQL-native alternative to `sql.unnest`. It may have a slight performance advantage over jsonb_populate_recordset, at the cost of some manual typing, since it requires explicit columns.
 */
test('jsonb_to_recordset', async () => {
  const records = [
    {id: 11, name: 'eleven'},
    {id: 12, name: 'twelve'},
    {id: 13, name: 'thirteen'},
    {id: 14, name: 'fourteen'},
  ]
  const result = await client.any(sql`
    insert into usage_test
    select *
    from jsonb_to_recordset(
      ${JSON.stringify(records, null, 2)}
    ) as x(id int, name text)
    returning *
  `)

  expect(result).toEqual([
    {id: 11, name: 'eleven'},
    {id: 12, name: 'twelve'},
    {id: 13, name: 'thirteen'},
    {id: 14, name: 'fourteen'},
  ])
})

/**
 * `sql.join` lets you join multiple SQL fragments with a separator.
 */
test('sql.join', async () => {
  const [result] = await client.any(sql`
    update usage_test
    set ${sql.join([sql`name = 'one hundred'`, sql`id = 100`], sql`, `)}
    where id = 1
    returning *
  `)

  expect(result).toEqual({id: 100, name: 'one hundred'})
})

/**
 * Use `sql.fragment` to build reusable pieces which can be plugged into full queries.
 */
test('sql.fragment', async () => {
  const idGreaterThan = (id: number) => sql.fragment`id > ${id}`
  const result = await client.any(sql`
    select * from usage_test where ${idGreaterThan(1)}
  `)

  expect(result).toEqual([
    {id: 2, name: 'two'},
    {id: 3, name: 'three'},
  ])
})

/**
 * You can also use `` sql`...` `` to create a fragment of SQL, but it's recommended to use `sql.fragment` instead for explicitness.
 * Support for [type-generation](https://npmjs.com/package/@pgkit/typegen) is better using `sql.fragment` too.
 */
test('nested `sql` tag', async () => {
  const idGreaterThan = (id: number) => sql`id > ${id}`
  const result = await client.any(sql`
    select * from usage_test where ${idGreaterThan(1)}
  `)

  expect(result).toEqual([
    {id: 2, name: 'two'},
    {id: 3, name: 'three'},
  ])
})

/**
 * A strongly typed helper for creating a PostgreSQL interval. Note that you could also do something like `'1 day'::interval`, but this way avoids a cast and offers typescript types.
 */
test('sql.interval', async () => {
  const result = await client.oneFirst(sql`
    select '2000-01-01T12:00:00Z'::timestamptz + ${sql.interval({days: 1, hours: 1})} as ts
  `)
  expect(result).toBeInstanceOf(Date)
  expect(result).toMatchInlineSnapshot(`"2000-01-02T13:00:00.000Z"`)

  const interval = await client.oneFirst(sql`select ${sql.interval({days: 1})}`)
  expect(interval).toMatchInlineSnapshot(`"1 day"`)
})

/**
 * Pass a buffer value from JavaScript to PostgreSQL.
 */
test('sql.binary', async () => {
  const result = await client.oneFirst(sql`
    select ${sql.binary(Buffer.from('hello'))} as b
  `)
  expect(result).toMatchInlineSnapshot(`"\\\\x68656c6c6f"`)
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

/**
 * Use `sql.literal` to inject a raw SQL string into a query. It is escaped, so safe from SQL injection, but it's not parameterized, so
 * should only be used where parameters are not possible, i.e. for non-optimizeable SQL commands.
 *
 * From the [PostgreSQL documentation](https://www.postgresql.org/docs/current/plpgsql-statements.html):
 *
 * >PL/pgSQL variable values can be automatically inserted into optimizable SQL commands, which are SELECT, INSERT, UPDATE, DELETE, MERGE, and certain utility commands that incorporate one of these, such as EXPLAIN and CREATE TABLE ... AS SELECT. In these commands, any PL/pgSQL variable name appearing in the command text is replaced by a query parameter, and then the current value of the variable is provided as the parameter value at run time. This is exactly like the processing described earlier for expressions.
 *
 * For other statements, such as the below, you'll need to use `sql.literalValue`.
 */
test('sql.literalValue', async () => {
  const result = await client.transaction(async tx => {
    await tx.query(sql`set local search_path to ${sql.literalValue('abc')}`)
    return tx.one(sql`show search_path`)
  })

  expect(result).toEqual({search_path: 'abc'})
  const result2 = await client.one(sql`show search_path`)
  expect(result2?.search_path).toMatch(/\bpublic\b/)
})

/**
 * A sub-transaction can be created from within another transaction. Under the hood, @pgkit/client
 * will generate `savepoint` statements, so that the sub-transactions can roll back if necessary.
 */
test('transaction savepoints', async () => {
  const log = vi.fn() // mock logger
  await client.transaction(async t1 => {
    await t1.query(sql`delete from usage_test`)
    await t1.query(sql`insert into usage_test(id, name) values (10, 'ten')`)
    log('count 1', await t1.oneFirst(sql`select count(1) from usage_test`))

    await t1
      .transaction(async t2 => {
        await t2.query(sql`insert into usage_test(id, name) values (11, 'eleven')`)

        log('count 2', await t2.oneFirst(sql`select count(1) from usage_test`))

        throw new Error(`Uh-oh`)
      })
      .catch(e => {
        log('error', e)
      })
  })

  log('count 3', await client.oneFirst(sql`select count(1) from usage_test`))

  expect(log.mock.calls).toEqual([
    ['count 1', 1], // after initial insert
    ['count 2', 2], // after insert in sub-transaction
    ['error', expect.objectContaining({message: 'Uh-oh'})], // error causing sub-transaciton rollback
    ['count 3', 1], // back to count after initial insert - sub-transaction insert was rolled back to the savepoint
  ])

  const newRecords = await client.any(sql`select * from usage_test where id >= 10`)
  expect(newRecords).toEqual([{id: 10, name: 'ten'}])
})
/**
 * `sql.type` lets you use a zod schema (or another type validator) to validate the result of a query. See the [Zod](#zod) section for more details.
 */
test('sql.type', async () => {
  const StringId = z.object({id: z.string()})
  await expect(client.any(sql.type(StringId)`select id::text from usage_test`)).resolves.toMatchObject([
    {id: '1'},
    {id: '2'},
    {id: '3'},
  ])

  const error = await client.any(sql.type(StringId)`select id from usage_test`).catch(e => e)

  expect(error).toMatchInlineSnapshot(`
    [QueryError]: [select-usage_test_8729cac]: Parsing rows failed: ✖ Expected string, received number → at id
      Caused by: [StandardSchemaV1Error]: Standard Schema error - details in \`issues\`.
  `)
})

test('sql.type with valibot', async () => {
  const StringId = v.object({id: v.string()})
  await expect(client.any(sql.type(StringId)`select id::text from usage_test`)).resolves.toMatchObject([
    {id: '1'},
    {id: '2'},
    {id: '3'},
  ])

  const error = await client.any(sql.type(StringId)`select id from usage_test`).catch(e => e)

  expect(error).toMatchInlineSnapshot(`
    [QueryError]: [select-usage_test_8729cac]: Parsing rows failed: ✖ Invalid type: Expected string but received 1 → at id
      Caused by: [StandardSchemaV1Error]: Standard Schema error - details in \`issues\`.
  `)
})

/**
 * Wrap the query function to customize the error message
 */
test('sql.type with custom error message', async () => {
  client = createClient(client.connectionString(), {
    ...client.options,
    pgpOptions: {
      ...client.options.pgpOptions,
      connect: {
        ...client.options.pgpOptions?.connect,
        application_name: 'impatient',
      },
    },
  })
  const StringId = z.object({id: z.string()})

  const error = await client.any(sql.type(StringId)`select id from usage_test`).catch(e => e)

  expect(error).toMatchInlineSnapshot(`
    [QueryError]: [select-usage_test_8729cac]: Parsing rows failed: ✖ Expected string, received number → at id
      Caused by: [StandardSchemaV1Error]: Standard Schema error - details in \`issues\`.
  `)
})

/**
 * `createSqlTag` lets you create your own `sql` tag, which you can export and use instead of the deafult one,
 * to add commonly-used schemas, which can be referred to by their key in the `createSqlTag` definition.
 */
test('createSqlTag + sql.typeAlias', async () => {
  const sql = createSqlTag({
    typeAliases: {
      Profile: z.object({
        name: z.string(),
      }),
    },
  })

  const result = await client.one(sql.typeAlias('Profile')`select 'Bob' as name`)
  expectTypeOf(result).toEqualTypeOf<{name: string}>()
  expect(result).toEqual({name: 'Bob'})

  const err = await client.any(sql.typeAlias('Profile')`select 123 as name`).catch(e => e)
  expect(err).toMatchInlineSnapshot(`
    [QueryError]: [select_245d49b]: Parsing rows failed: ✖ Expected string, received number → at name
      Caused by: [StandardSchemaV1Error]: Standard Schema error - details in \`issues\`.
  `)
})

test('await sql - createSqlTag', async () => {
  const {sql} = client

  const xx = await sql<{a: number; b: number}>`select 1 as a, 2 as b`

  expect(xx).toEqual([{a: 1, b: 2}])
  expect(xx.one).toEqual({a: 1, b: 2})
  expect(xx.oneFirst).toEqual(1)
  expect(xx.maybeOneFirst).toEqual(1)
  expect(xx.many).toEqual([{a: 1, b: 2}])
  expect(xx.manyFirst).toEqual([1])
  expectTypeOf(xx).toMatchTypeOf<{a: number; b: number}[]>()
  expectTypeOf(xx.one).toEqualTypeOf<{a: number; b: number}>()

  const Type = z.object({a: z.number(), b: z.number()})
  const yy = await sql.type(Type)`select 1 as a, 2 as b`
  expect(yy).toEqual([{a: 1, b: 2}])
  expect(yy.one).toEqual({a: 1, b: 2})
  expect(yy.oneFirst).toEqual(1)
  expect(yy.maybeOneFirst).toEqual(1)
  expect(yy.many).toEqual([{a: 1, b: 2}])
  expect(yy.manyFirst).toEqual([1])

  expectTypeOf(yy.manyFirst).toEqualTypeOf<number[]>()
})

test('await sql - clientStorage', async () => {
  // you can't await sql`...` without providing a client first:
  await expect(async () => await sql`select 1`).rejects.toMatchInlineSnapshot(
    `[Error]: No client provided to sql tag - either use \`createSqlTag({client})\` or provide it with \`pgkitStorage.run({client}, () => ...)\``,
  )

  const results = await pgkitStorage.run({client}, async () => {
    const xx = await sql<{a: number; b: number}>`select 1 as a, 2 as b`

    expect(xx).toEqual([{a: 1, b: 2}])
    expect(xx.one).toEqual({a: 1, b: 2})
    expect(xx.oneFirst).toEqual(1)
    expect(xx.maybeOneFirst).toEqual(1)
    expect(xx.many).toEqual([{a: 1, b: 2}])
    expect(xx.manyFirst).toEqual([1])
    expectTypeOf(xx).toMatchTypeOf<{a: number; b: number}[]>()
    expectTypeOf(xx.one).toEqualTypeOf<{a: number; b: number}>()

    const Type = z.object({a: z.number(), b: z.number()})
    const yy = await sql.type(Type)`select 1 as a, 2 as b`
    expect(yy).toEqual([{a: 1, b: 2}])
    expect(yy.one).toEqual({a: 1, b: 2})
    expect(yy.oneFirst).toEqual(1)
    expect(yy.maybeOneFirst).toEqual(1)
    expect(yy.many).toEqual([{a: 1, b: 2}])
    expect(yy.manyFirst).toEqual([1])

    expectTypeOf(yy.manyFirst).toEqualTypeOf<number[]>()

    return {xx, yy}
  })

  expect(results).toMatchInlineSnapshot(`
    {
      "xx": [
        {
          "a": 1,
          "b": 2
        }
      ],
      "yy": [
        {
          "a": 1,
          "b": 2
        }
      ]
    }
  `)
})

test('await sql - bad type', async () => {
  const sql = createSqlTag({client})

  const Foo = z.object({foo: z.number()})

  await expect(async () => await sql.type(Foo)`select 1 as bar`).rejects.toMatchInlineSnapshot(
    `
      [QueryError]: [select_96972d5]: Parsing rows failed: ✖ Required → at foo
        Caused by: [StandardSchemaV1Error]: Standard Schema error - details in \`issues\`.
    `,
  )
})
