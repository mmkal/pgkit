import {createPool, createSqlTag, sql} from 'slonik23'
import {beforeAll, beforeEach, expect, test, vi} from 'vitest'

let client: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  client = createPool('postgresql://postgres:postgres@localhost:5432/postgres')
})

// codegen:start {preset: custom, source: ./generate.ts, export: generate, dev: true, removeTests: [sql.interval, sql.jsonb, sql.literalValue, sql.fragment, sql.type, 'createSqlTag + sql.typeAlias']}
beforeEach(async () => {
  await client.query(sql`
    drop table if exists test_slonik23;
    create table test_slonik23(id int, name text);
    insert into test_slonik23 values (1, 'one'), (2, 'two'), (3, 'three');
  `)
})

test('sql.array', async () => {
  const result = await client.any(sql`
    select *
    from test_slonik23
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
    from ${sql.identifier(['public', 'test_slonik23'])}
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
    insert into test_slonik23(id, name)
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
    update test_slonik23
    set ${sql.join([sql`name = 'one hundred'`, sql`id = 100`], sql`, `)}
    where id = 1
    returning *
  `)

  expect(result).toEqual({id: 100, name: 'one hundred'})
})

/**
 * Use `sql.fragment` to build reusable pieces which can be plugged into full queries.
 */

test('nested `sql` tag', async () => {
  const idGreaterThan = (id: number) => sql`id > ${id}`
  const result = await client.any(sql`
    select * from test_slonik23 where ${idGreaterThan(1)}
  `)

  expect(result).toEqual([
    {id: 2, name: 'two'},
    {id: 3, name: 'three'},
  ])
})

/**
 * A strongly typed helper for creating a PostgreSQL interval. Note that you could also do something like `'1 day'::interval`, but this way avoids a cast and offers typescript types.
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

test('transaction savepoints', async () => {
  const log = vi.fn() // mock logger
  await client.transaction(async t1 => {
    await t1.query(sql`delete from test_slonik23`)
    await t1.query(sql`insert into test_slonik23(id, name) values (10, 'ten')`)
    log('count 1', await t1.oneFirst(sql`select count(1) from test_slonik23`))

    await t1
      .transaction(async t2 => {
        await t2.query(sql`insert into test_slonik23(id, name) values (11, 'eleven')`)

        log('count 2', await t2.oneFirst(sql`select count(1) from test_slonik23`))

        throw new Error(`Uh-oh`)
      })
      .catch(e => {
        log('error', e)
      })
  })

  log('count 3', await client.oneFirst(sql`select count(1) from test_slonik23`))

  expect(log.mock.calls).toEqual([
    ['count 1', 1], // after initial insert
    ['count 2', 2], // after insert in sub-transaction
    ['error', expect.objectContaining({message: 'Uh-oh'})], // error causing sub-transaciton rollback
    ['count 3', 1], // back to count after initial insert - sub-transaction insert was rolled back to the savepoint
  ])

  const newRecords = await client.any(sql`select * from test_slonik23 where id >= 10`)
  expect(newRecords).toEqual([{id: 10, name: 'ten'}])
})
/**
 * `sql.type` lets you use a zod schema (or another type validator) to validate the result of a query. See the [Zod](#zod) section for more details.
 */
// codegen:end

test('type parsers', async () => {
  const result = await client.one(sql`
    select
      '1 day'::interval as day_interval,
      '1 hour'::interval as hour_interval,
      '2000-01-01T12:00:00Z'::timestamptz as timestamptz,
      '2000-01-01T12:00:00Z'::timestamp as timestamp,
      '2000-01-01T12:00:00Z'::date as date,
      (select count(*) from test_slonik23 where id = -1) as count
  `)

  expect(result).toMatchInlineSnapshot(
    {timestamp: expect.any(Number)},
    `
      {
        "count": 0,
        "date": "2000-01-01",
        "day_interval": 86400,
        "hour_interval": 3600,
        "timestamp": Any<Number>,
        "timestamptz": 946728000000,
      }
    `,
  )
})
