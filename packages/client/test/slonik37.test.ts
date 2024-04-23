/* eslint-disable @typescript-eslint/no-shadow */
import {
  createPool,
  sql as _sql,
  createSqlTag,
  SchemaValidationError,
  QueryResultRow,
  Interceptor,
  createTypeParserPreset,
} from 'slonik37'
import {beforeAll, beforeEach, expect, expectTypeOf, test, vi} from 'vitest'
import z from 'zod'

const sql = Object.assign(_sql.unsafe, _sql)

let client: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  const createResultParserInterceptor = (): Interceptor => {
    return {
      // If you are not going to transform results using Zod, then you should use `afterQueryExecution` instead.
      // Future versions of Zod will provide a more efficient parser when parsing without transformations.
      // You can even combine the two – use `afterQueryExecution` to validate results, and (conditionally)
      // transform results as needed in `transformRow`.
      transformRow: (executionContext, actualQuery, row) => {
        const {resultParser} = executionContext

        if (!resultParser) {
          return row
        }

        const validationResult = resultParser.safeParse(row)

        if (!validationResult.success) {
          throw new SchemaValidationError(actualQuery, row, validationResult.error.issues)
        }

        return validationResult.data as QueryResultRow
      },
    }
  }

  client = await createPool('postgresql://postgres:postgres@localhost:5432/postgres', {
    interceptors: [createResultParserInterceptor()],
    typeParsers: [
      ...createTypeParserPreset(),
      {
        name: 'int8',
        parse: value => Number(value.toString().replace(/n$/, '')),
      },
    ],
  })
})

// codegen:start {preset: custom, source: ./generate.cjs, export: generate, dev: true, removeTests: []}
beforeEach(async () => {
  await client.query(sql`
    drop table if exists test_slonik37;
    create table test_slonik37(id int, name text);
    insert into test_slonik37 values (1, 'one'), (2, 'two'), (3, 'three');
  `)
})

test('sql.array', async () => {
  const result = await client.any(sql`
    select *
    from test_slonik37
    where name = any(${sql.array(['one', 'two'], 'text')})
  `)
  expect(result).toEqual([
    {id: 1, name: 'one'},
    {id: 2, name: 'two'},
  ])
})

/**
 * String parameters are formatted in as parameters. To use dynamic strings for schema names, table names, etc.
 * you can use `sql.identifier`.
 */
test('sql.identifier', async () => {
  const result = await client.oneFirst(sql`
    select count(1)
    from ${sql.identifier(['public', 'test_slonik37'])}
  `)

  expect(Number(result)).toEqual(3)
})

/**
 * `sql.unnest` lets you add many rows in a single query, without generating large SQL statements.
 * It also lets you pass arrays of rows, which is more intuitive than arrays of columns.
 */
test('sql.unnest', async () => {
  const values = [
    {id: 1, name: 'one'},
    {id: 2, name: 'two'},
    {id: 3, name: 'three'},
    {id: 4, name: 'four'},
  ]
  const result = await client.any(sql`
    insert into test_slonik37(id, name)
    select *
    from ${sql.unnest(
      values.map(({id, name}) => [id, name]),
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

/**
 * `sql.join` lets you join multiple SQL fragments with a separator.
 */
test('sql.join', async () => {
  const [result] = await client.any(sql`
    update test_slonik37
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
    select * from test_slonik37 where ${idGreaterThan(1)}
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
    select * from test_slonik37 where ${idGreaterThan(1)}
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
  expect(new Date(result)).toBeInstanceOf(Date)
  expect(result).toMatchSnapshot()

  const interval = await client.oneFirst(sql`select ${sql.interval({days: 1})}`)
  expect(interval).toMatchSnapshot()
})

/**
 * Pass a buffer value from JavaScript to PostgreSQL.
 */
test('sql.binary', async () => {
  const result = await client.oneFirst(sql`
    select ${sql.binary(Buffer.from('hello'))} as b
  `)
  expect(result).toMatchSnapshot()
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
    await t1.query(sql`delete from test_slonik37`)
    await t1.query(sql`insert into test_slonik37(id, name) values (10, 'ten')`)
    log('count 1', await t1.oneFirst(sql`select count(1) from test_slonik37`))

    await t1
      .transaction(async t2 => {
        await t2.query(sql`insert into test_slonik37(id, name) values (11, 'eleven')`)

        log('count 2', await t2.oneFirst(sql`select count(1) from test_slonik37`))

        throw new Error(`Uh-oh`)
      })
      .catch(e => {
        log('error', e)
      })
  })

  log('count 3', await client.oneFirst(sql`select count(1) from test_slonik37`))

  expect(log.mock.calls).toEqual([
    ['count 1', 1], // after initial insert
    ['count 2', 2], // after insert in sub-transaction
    ['error', expect.objectContaining({message: 'Uh-oh'})], // error causing sub-transaciton rollback
    ['count 3', 1], // back to count after initial insert - sub-transaction insert was rolled back to the savepoint
  ])

  const newRecords = await client.any(sql`select * from test_slonik37 where id >= 10`)
  expect(newRecords).toEqual([{id: 10, name: 'ten'}])
})
/**
 * `sql.type` lets you use a zod schema (or another type validator) to validate the result of a query. See the [Zod](#zod) section for more details.
 */
test('sql.type', async () => {
  const StringId = z.object({id: z.string()})
  await expect(client.any(sql.type(StringId)`select text(id) id from test_slonik37`)).resolves.toMatchObject([
    {id: '1'},
    {id: '2'},
    {id: '3'},
  ])

  const error = await client.any(sql.type(StringId)`select id from test_slonik37`).catch(e => e)

  expect(error.cause).toMatchSnapshot()
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
  expect(err.cause).toMatchSnapshot()
})
// codegen:end

test('raw query', async () => {
  const query = 'select 1 as foo'

  const result = await client.one({
    parser: z.any(),
    sql: query,
    type: 'SLONIK_TOKEN_QUERY',
    values: [],
  })

  expect(result).toEqual({foo: 1})
})
