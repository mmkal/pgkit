# @pgkit/client

A strongly-typed postgres client for node.js. Lets you execute SQL, without abstractions, safely.

<img src="./images/logo.png" alt="Logo" width="200"/>

## Introduction

@pgkit/client is a PostgreSQL client, to be used in any application with a PostgreSQL database.

```ts
import {createClient, sql} from '@pgkit/client'

const client = createClient('postgresql://')

const profiles = await client.query(sql`
  select * from profile where email = ${getEmail()}
`)
```

The basic idea is this: PostgreSQL is well designed. SQL as as language has been refined over decades, and its strengths, weaknesses and tradeoffs are widely known. You shouldn't let an ORM, or a query builder, introduce an unnecessary abstraction between your application and your database.

@pgkit/client allows you to write SQL queries - no matter how complex they may be, and whatever niche PostgreSQL features they may use. You will get precise TypeScript types for the results, without sacrificing the protection against SQL injection attacks that ORMs offer. See the [types](#types) and [protections](#protections) sections for more details on how.

The API design is based on [slonik](https://npmjs.com/package/slonik) - which remains an excellent SQL client. The reasons for using @pgkit/client over an ORM like prisma, or a query builder like knex.js, are the same as for slonik. For why this library exists, and why you might want to use @pgkit/client over slonik see the [comparison with slonik](#comparison-with-slonik) section. The driver for @pgkit/client is [pg-promise](https://npmjs.com/package/pg-promise).

## Ecosystem

@pgkit/client is the basis for these libraries:

<!-- codegen:start {preset: monorepoTOC, repoRoot: ../.., filter: "^(?!.*(client|^pgkit$))", sort: topological} -->
- [@pgkit/typegen](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/typegen#readme) - Automatically generates typescript types from SQL queries
- [@pgkit/schemainspect](./packages/schemainspect) - SQL Schema Inspection for PostgreSQL
- [@pgkit/migra](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/migra#readme) - A CLI to generate PostgeSQL schema diff scripts
- [@pgkit/admin](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/admin#readme) - A zero-config PostgeSQL admin server, with schema inspection and autocomplete.
- [@pgkit/migrator](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/migrator#readme) - PostgeSQL migration tool
<!-- codegen:end -->

Note that @pgkit/migra and @pgkit/schemainspect are pure ports of their Python equivalents. They are fantastically useful, and hopefully more and more can be built on top of them in the future.

# Contents

<!-- codegen:start {preset: markdownTOC}-->
- [Introduction](#introduction)
- [Ecosystem](#ecosystem)
- [Protections](#protections)
   - [Protection against SQL injection](#protection-against-sql-injection)
   - [Protection against hanging connections](#protection-against-hanging-connections)
   - [Protection against hanging transactions](#protection-against-hanging-transactions)
- [Get started](#get-started)
- [`sql` API](#sql-api)
   - [sql.array](#sqlarray)
   - [sql.identifier](#sqlidentifier)
   - [sql.unnest](#sqlunnest)
   - [sql.join](#sqljoin)
   - [sql.fragment](#sqlfragment)
   - [nested `sql` tag](#nested-sql-tag)
   - [sql.interval](#sqlinterval)
   - [sql.binary](#sqlbinary)
   - [sql.json](#sqljson)
   - [sql.jsonb](#sqljsonb)
   - [JSON.stringify](#jsonstringify)
   - [sql.literalValue](#sqlliteralvalue)
   - [transaction savepoints](#transaction-savepoints)
   - [sql.type](#sqltype)
   - [createSqlTag + sql.typeAlias](#createsqltag--sqltypealias)
- [Types](#types)
- [Automatic type generation](#automatic-type-generation)
   - [Zod](#zod)
- [Recipes](#recipes)
   - [Inserting many rows with sql.unnest](#inserting-many-rows-with-sqlunnest)
   - [Query logging](#query-logging)
   - [query timeouts](#query-timeouts)
   - [switchable clients](#switchable-clients)
   - [mocking](#mocking)
- [Comparison with slonik](#comparison-with-slonik)
   - [Added features/improvements](#added-featuresimprovements)
      - [`sql`](#sql)
      - [`sql.raw`](#sqlraw)
      - [Non-readonly output types](#non-readonly-output-types)
      - [Errors](#errors)
         - [one error](#one-error)
         - [maybeOne error](#maybeone-error)
         - [many error](#many-error)
         - [syntax error](#syntax-error)
   - [Missing features](#missing-features)
      - [`connection.stream`](#connectionstream)
      - [Interceptors](#interceptors)
- [👽 Future](#-future)
<!-- codegen:end -->

## Protections

### Protection against SQL injection

@pgkit/client uses a tagged template literal, usually imported as `sql`, to prevent [SQL injection attacks](https://owasp.org/www-community/attacks/SQL_Injection). In a library like `pg`, or `pg-promise` (which are dependencies of this library, and this is _not_ the recommended way to use them!), you would be able to do something like this:

```ts
await pgPromise.query(`
  update profile
  set name = '${req.body.name}'
`)
```

Which will work for some users. Until an [evil user](https://xkcd.com/327) sends a POST request looking something like `{ "name": "''; drop table profile" }`. (In fact, with the above code, even an innocent user with an apostrophe in their name might be unable to update their profile!)

By contrast, here's how you would have to write this query in @pgkit/client:

```ts
await client.query(sql`
  update profile
  set name = ${req.body.name}
`)
```

@pgkit/client will handle Bobby Tables and Adrian O'Grady without any problem, because the query that's actually run in the underlying layer is:

```ts
await pgPromise.query('update profile set name = $1', req.body.name)
```

The above is more like the recommended way of using `pg-promise`. @pgkit/client doesn't let you pass a string to its various `query` methods - you must pass the result returned by the `sql` tag.

The idea is to make it _easy to do the right thing_, and _hard to do the wrong thing_.

(Note: if you really have a use case for avoiding the template tag, it's your foot and, your gun. See the docs on [`sql.raw` for more info](#sqlraw)).

### Protection against hanging connections

Here's how you might connect to a pool in `pg` (taken directly from [their docs](https://node-postgres.com/features/connecting)):

```ts
await pg.connect()

const res = await pg.query('SELECT NOW()')
await pg.end()
```

This works fine for the above example, because you can be pretty sure that `SELECT NOW()` will always succeed. But what about when your query throws an error? The call to `await client.end()` will never run, and the connection will be left open. You can solve this by using `try`/`finally` every time you connect, but you might find your codebase quickly littered with boilerplate along these lines. And you are responsible for never forgetting to! Here's the equivalent in @pgkit/client:

```ts
const res = await client.connect(async connection => {
  return connection.query(sql`SELECT NOW()`)
})
```

This will automatically release the connection when the callback _either_ resolves or throws.

### Protection against hanging transactions

Similarly, transactions are automatically rolled back when they fail, and ended when they succeed:

```ts
await client.transaction(async tx => {
  await tx.query(sql`update profile set name = ${req.body.name}`)
  await tx.query(sql`update foo set bar = ${req.body.baz}`)
})
```

See [sub-transactions](#sub-transactions) and [transaction savepoints](#transaction-savepoints) for more involved examples.

## Get started

Install as a dependency using npm (or yarn, or pnpm, or bun):

```
npm install @pgkit/client
```

Create a client and start querying with it:

```ts
import {sql, createClient} from '@pgkit/client'

const client = createClient(
  'postgres://postgres:postgres@localhost:5432/postgres',
)

export const getProfile = async (id: string) => {
  const profile = await client.one(sql`select * from profile where id = ${id}`)
  return {
    name: profile.name,
  }
}

export const updateProfileName = (id: string, name: string) => {
  await client.transaction(async tx => {
    const profile = await tx.one(sql`
      update profile set name = ${name} where id = ${id} returning *
    `)
    await tx.query(sql`
      insert into some_other_table (foo) values (${profile.foo})
    `)
  })
}
```

## `sql` API

The export you'll work with the most is the `sql` tag. This doubles as a a tagged template function, as well as a collection of helpers exposed as properties on the `sql` export.

The simplest usage is as above, just using `sql` as a tagged template function:

```ts
await client.query(sql`insert into profile (id, name) values (1, 'one')`)
```

Here's a usage example for each of the `sql...` methods:

<!-- codegen:start {preset: markdownFromTests, source: test/api-usage.test.ts, headerLevel: 3} -->
### sql.array

```typescript
const result = await client.any(sql`
  select *
  from usage_test
  where name = any(${sql.array(['one', 'two'], 'text')})
`)
expect(result).toEqual([
  {id: 1, name: 'one'},
  {id: 2, name: 'two'},
])
```

### sql.identifier

String parameters are formatted in as parameters. To use dynamic strings for schema names, table names, etc. you can use `sql.identifier`.

```typescript
const result = await client.oneFirst(sql`
  select count(1)
  from ${sql.identifier(['public', 'usage_test'])}
`)

expect(Number(result)).toEqual(3)
```

### sql.unnest

`sql.unnest` lets you add many rows in a single query, without generating large SQL statements. It also lets you pass arrays of rows, which is more intuitive than arrays of columns.

```typescript
const values = [
  {id: 1, name: 'one'},
  {id: 2, name: 'two'},
  {id: 3, name: 'three'},
  {id: 4, name: 'four'},
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
  {id: 1, name: 'one'},
  {id: 2, name: 'two'},
  {id: 3, name: 'three'},
  {id: 4, name: 'four'},
])
```

### sql.join

`sql.join` lets you join multiple SQL fragments with a separator.

```typescript
const [result] = await client.any(sql`
  update usage_test
  set ${sql.join([sql`name = 'one hundred'`, sql`id = 100`], sql`, `)}
  where id = 1
  returning *
`)

expect(result).toEqual({id: 100, name: 'one hundred'})
```

### sql.fragment

Use `sql.fragment` to build reusable pieces which can be plugged into full queries.

```typescript
const idGreaterThan = (id: number) => sql.fragment`id > ${id}`
const result = await client.any(sql`
  select * from usage_test where ${idGreaterThan(1)}
`)

expect(result).toEqual([
  {id: 2, name: 'two'},
  {id: 3, name: 'three'},
])
```

### nested `sql` tag

You can also use `` sql`...` `` to create a fragment of SQL, but it's recommended to use `sql.fragment` instead for explicitness. Support for [type-generation](https://npmjs.com/package/@pgkit/typegen) is better using `sql.fragment` too.

```typescript
const idGreaterThan = (id: number) => sql`id > ${id}`
const result = await client.any(sql`
  select * from usage_test where ${idGreaterThan(1)}
`)

expect(result).toEqual([
  {id: 2, name: 'two'},
  {id: 3, name: 'three'},
])
```

### sql.interval

A strongly typed helper for creating a PostgreSQL interval. Note that you could also do something like `'1 day'::interval`, but this way avoids a cast and offers typescript types.

```typescript
const result = await client.oneFirst(sql`
  select '2000-01-01T12:00:00Z'::timestamptz + ${sql.interval({days: 1, hours: 1})} as ts
`)
expect(result).toBeInstanceOf(Date)
expect(result).toMatchInlineSnapshot(`2000-01-02T13:00:00.000Z`)

const interval = await client.oneFirst(sql`select ${sql.interval({days: 1})}`)
expect(interval).toMatchInlineSnapshot(`"1 day"`)
```

### sql.binary

Pass a buffer value from JavaScript to PostgreSQL.

```typescript
const result = await client.oneFirst(sql`
  select ${sql.binary(Buffer.from('hello'))} as b
`)
expect(result).toMatchInlineSnapshot(`"\\x68656c6c6f"`)
```

### sql.json

```typescript
await client.query(sql`
  drop table if exists jsonb_test;
  create table jsonb_test (id int, data jsonb);
`)

const insert = await client.one(sql`
  insert into jsonb_test values (1, ${sql.json({foo: 'bar'})})
  returning *
`)

expect(insert).toEqual({data: {foo: 'bar'}, id: 1})
```

### sql.jsonb

```typescript
const insert = await client.one(sql`
  insert into jsonb_test values (1, ${sql.jsonb({foo: 'bar'})})
  returning *
`)

expect(insert).toEqual({data: {foo: 'bar'}, id: 1})
```

### JSON.stringify

```typescript
const insert = await client.one(sql`
  insert into jsonb_test values (1, ${JSON.stringify({foo: 'bar'})})
  returning *
`)

expect(insert).toEqual({data: {foo: 'bar'}, id: 1})
```

### sql.literalValue

Use `sql.literal` to inject a raw SQL string into a query. It is escaped, so safe from SQL injection, but it's not parameterized, so should only be used where parameters are not possible, i.e. for non-optimizeable SQL commands.

From the [PostgreSQL documentation](https://www.postgresql.org/docs/current/plpgsql-statements.html):

>PL/pgSQL variable values can be automatically inserted into optimizable SQL commands, which are SELECT, INSERT, UPDATE, DELETE, MERGE, and certain utility commands that incorporate one of these, such as EXPLAIN and CREATE TABLE ... AS SELECT. In these commands, any PL/pgSQL variable name appearing in the command text is replaced by a query parameter, and then the current value of the variable is provided as the parameter value at run time. This is exactly like the processing described earlier for expressions.

For other statements, such as the below, you'll need to use `sql.literalValue`.

```typescript
const result = await client.transaction(async tx => {
  await tx.query(sql`set local search_path to ${sql.literalValue('abc')}`)
  return tx.one(sql`show search_path`)
})

expect(result).toEqual({search_path: 'abc'})
const result2 = await client.one(sql`show search_path`)
expect(result2).toEqual({search_path: '"$user", public'})
```

### transaction savepoints

A sub-transaction can be created from within another transaction. Under the hood, @pgkit/client will generate `savepoint` statements, so that the sub-transactions can roll back if necessary.

```typescript
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
```

### sql.type

`sql.type` lets you use a zod schema (or another type validator) to validate the result of a query. See the [Zod](#zod) section for more details.

```typescript
const StringId = z.object({id: z.string()})
await expect(client.any(sql.type(StringId)`select text(id) id from usage_test`)).resolves.toMatchObject([
  {id: '1'},
  {id: '2'},
  {id: '3'},
])

const error = await client.any(sql.type(StringId)`select id from usage_test`).catch(e => e)

expect(error.cause).toMatchInlineSnapshot(`
  {
    "error": [ZodError: [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "number",
      "path": [
        "id"
      ],
      "message": "Expected string, received number"
    }
  ]],
    "query": {
      "name": "select-usage_test_8729cac",
      "parse": [Function],
      "sql": "select id from usage_test",
      "templateArgs": [Function],
      "token": "sql",
      "values": [],
    },
  }
`)
```

### createSqlTag + sql.typeAlias

`createSqlTag` lets you create your own `sql` tag, which you can export and use instead of the deafult one, to add commonly-used schemas, which can be referred to by their key in the `createSqlTag` definition.

```typescript
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
expect(err.cause).toMatchInlineSnapshot(`
  {
    "error": [ZodError: [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "number",
      "path": [
        "name"
      ],
      "message": "Expected string, received number"
    }
  ]],
    "query": {
      "name": "select_245d49b",
      "parse": [Function],
      "sql": "select 123 as name",
      "templateArgs": [Function],
      "token": "sql",
      "values": [],
    },
  }
`)
```
<!-- codegen:end -->

## Types

You can define the type for a query:

```ts
const profiles = await client.any(
  sql<{id: string; name: string}>`select * from profile`,
)
// `profiles` will have type `Array<{id: string; name: string}>`
```

It is also possible to supply a generic type argument to the `.any<...>` method, but it's better to apply it to the query itself (i.e. `` sql<...>`select ...` ``) since that decouples it from the query method you use:

```ts
type Profile = {id: string; name: string}
const profileQuery = sql<Profile>`select id, name from profile`

const profiles = await client.any(profileQuery) // has type Profile[]
const profiles = await client.many(profileQuery) // has type Profile[]
const queryResult = await client.query(profileQuery) // has type {rows: Profile[]}
const profile = await client.one(profileQuery) // has type Profile
const maybeProfile = await client.maybeOne(profileQuery) // has type Profile | null
```

## Automatic type generation

The companion library [@pgkit/typegen](https://npmjs.com/package/@pgkit/typegen) will automatically typescript types to your queries, by analyzing the SQL. This offers a pretty unique developer experience. You get the type-safety of an ORM, but without the tradeoffs: no vendor lock-in, no having to learn how to use the ORM rather than PostgreSQL, no auto-generated slow queries, no arbitrary limitations on the queries you can run.

Check out the typegen package for more details, but essentially it will analyse your SQL queries, and map PostgreSQL types to TypeScript, to transform code like this:

```ts
const profiles = await client.any(sql`select * from profile`)
```

Into this:

<!-- eslint-disable @typescript-eslint/no-namespace -->
```ts
const profiles = await client.any(sql<queries.Profile>`select * from profile`)

declare namespace queries {
  // Generated by @pgkit/typegen

  export interface Profile {
    id: string
    name: string | null
  }
}
```

### Zod

If you like, you can use [zod](https://npmjs.com/package/zod) to parse query results:

```ts
const Profile = z.object({
  id: z.string(),
  name: z.string(),
})

const profiles = await client.any(sql.type(Profile)`select * from profile`)
```

This will use zod to validate each row returned by your query.

Note that zod is not a dependency of this library, nor even a peer dependency. In fact, you could use a different library entirely, as long as you provide a "type" which has a `parse` method:

```ts
import * as v from 'valibot'

const ProfileSchema = v.object({
  id: v.string(),
  name: v.string(),
})
const Profile = {
  parse: (input: unknown) => v.parse(ProfileSchema, input),
}

const profiles = await client.any(sql.type(Profile)`select * from profile`)
```

You can also define `safeParse`, `parseAsync` or `safeParseAsync` as long as they match their zod equivalents:

```ts
import * as v from 'valibot'

const ProfileSchema = v.object({
  id: v.string(),
  name: v.string(),
})
const Profile = {
  parseAsync: async (input: unknown) => v.parse(ProfileSchema, input),
}

const profiles = await client.any(sql.type(Profile)`select * from profile`)
```

You can use any zod features here. For example:

<!-- codegen:start {preset: markdownFromTests, source: test/zod.test.ts} -->
Transform rows:

```typescript
const Row = z.object({
  id: z.number(),
  location: z
    .string()
    .regex(/^-?\d+,-?\d+$/)
    .transform(s => {
      const [lat, lon] = s.split(',')
      return {lat: Number(lat), lon: Number(lon)}
    }),
})

const result = await client.any(sql.type(Row)`
  select * from zod_test
`)

expect(result).toMatchInlineSnapshot(`
  [
    {
      "id": 1,
      "location": {
        "lat": 70,
        "lon": -108
      }
    },
    {
      "id": 2,
      "location": {
        "lat": 71,
        "lon": -102
      }
    },
    {
      "id": 3,
      "location": {
        "lat": 66,
        "lon": -90
      }
    }
  ]
`)
```

Refine schemas:

```typescript
const Row = z.object({
  id: z.number().refine(n => n % 2 === 0, {message: 'id must be even'}),
  name: z.string(),
})

const getResult = () =>
  client.any(sql.type(Row)`
    select * from recipes_test
  `)

await expect(getResult()).rejects.toMatchInlineSnapshot(`
  {
    "cause": {
      "query": {
        "name": "select-recipes_test_6e1b6e6",
        "sql": "\\n      select * from recipes_test\\n    ",
        "token": "sql",
        "values": []
      },
      "error": {
        "issues": [
          {
            "code": "custom",
            "message": "id must be even",
            "path": [
              "id"
            ]
          }
        ],
        "name": "ZodError"
      }
    }
  }
`)
```
<!-- codegen:end -->

## Recipes

<!-- codegen:start {preset: markdownFromTests, source: test/recipes.test.ts, headerLevel: 3} -->
### Inserting many rows with sql.unnest

```typescript
// Pass an array of rows to be inserted. There's only one variable in the generated SQL per column

await client.query(sql`
  insert into recipes_test(id, name)
  select *
  from ${sql.unnest(
    [
      [1, 'one'],
      [2, 'two'],
      [3, 'three'],
    ],
    ['int4', 'text'],
  )}
`)

expect(sqlProduced).toMatchInlineSnapshot(`
  [
    {
      "sql": "\\n    insert into recipes_test(id, name)\\n    select *\\n    from unnest($1::int4[], $2::text[])\\n  ",
      "values": [
        [
          1,
          2,
          3
        ],
        [
          "one",
          "two",
          "three"
        ]
      ]
    }
  ]
`)
```

### Query logging

```typescript
// Simplistic way of logging query times. For more accurate results, use process.hrtime()
const log = vi.fn()
const client = createClient('postgresql://postgres:postgres@localhost:5432/postgres', {
  wrapQueryFn: queryFn => {
    return async query => {
      const start = Date.now()
      const result = await queryFn(query)
      const end = Date.now()
      log({start, end, took: end - start, query, result})
      return result
    }
  },
})

await client.query(sql`select * from recipes_test`)

expect(log.mock.calls[0][0]).toMatchInlineSnapshot(
  {
    start: expect.any(Number),
    end: expect.any(Number),
    took: expect.any(Number),
  },
  `
    {
      "start": {
        "inverse": false
      },
      "end": {
        "inverse": false
      },
      "took": {
        "inverse": false
      },
      "query": {
        "name": "select-recipes_test_8d7ce25",
        "sql": "select * from recipes_test",
        "token": "sql",
        "values": []
      },
      "result": {
        "rows": [
          {
            "id": 1,
            "name": "one"
          },
          {
            "id": 2,
            "name": "two"
          },
          {
            "id": 3,
            "name": "three"
          }
        ]
      }
    }
  `,
)
```

### query timeouts

```typescript
const shortTimeoutMs = 20
const impatient = createClient(client.connectionString() + '?shortTimeout', {
  pgpOptions: {
    connect: ({client}) => {
      client.connectionParameters.query_timeout = shortTimeoutMs
    },
  },
})
const patient = createClient(client.connectionString() + '?longTimeout', {
  pgpOptions: {
    connect: ({client}) => {
      client.connectionParameters.query_timeout = shortTimeoutMs * 3
    },
  },
})

const sleepSeconds = (shortTimeoutMs * 2) / 1000
await expect(impatient.one(sql`select pg_sleep(${sleepSeconds})`)).rejects.toThrowErrorMatchingInlineSnapshot(
  `
    {
      "cause": {
        "query": {
          "name": "select_9dcc021",
          "sql": "select pg_sleep($1)",
          "token": "sql",
          "values": [
            0.04
          ]
        },
        "error": {
          "query": "select pg_sleep(0.04)"
        }
      }
    }
  `,
)
await expect(patient.one(sql`select pg_sleep(${sleepSeconds})`)).resolves.toMatchObject({
  pg_sleep: '',
})
```

### switchable clients

```typescript
const shortTimeoutMs = 20
const impatientClient = createClient(client.connectionString() + '?shortTimeout', {
  pgpOptions: {
    connect: ({client}) => {
      client.connectionParameters.query_timeout = shortTimeoutMs
    },
  },
})
const patientClient = createClient(client.connectionString() + '?longTimeout', {
  pgpOptions: {
    connect: ({client}) => {
      client.connectionParameters.query_timeout = shortTimeoutMs * 3
    },
  },
})

const appClient = createClient(client.connectionString(), {
  wrapQueryFn: _queryFn => {
    return async query => {
      let clientToUse = patientClient
      try {
        // use https://www.npmjs.com/package/pgsql-ast-parser - note that this is just an example, you may want to do something like route
        // readonly queries to a readonly connection, and others to a readwrite connection.
        const parsed = pgSqlAstParser.parse(query.sql)
        if (parsed.every(statement => statement.type === 'select')) {
          clientToUse = impatientClient
        }
      } catch {
        // ignore
      }

      return clientToUse.query(query)
    }
  },
})

const sleepSeconds = (shortTimeoutMs * 2) / 1000

await expect(
  appClient.one(sql`
    select pg_sleep(${sleepSeconds})
  `),
).rejects.toThrowErrorMatchingInlineSnapshot(`
  {
    "cause": {
      "query": {
        "name": "select_6289211",
        "sql": "\\n      select pg_sleep($1)\\n    ",
        "token": "sql",
        "values": [
          0.04
        ]
      },
      "error": {
        "query": "\\n      select pg_sleep(0.04)\\n    "
      }
    }
  }
`)
await expect(
  appClient.one(sql`
    with delay as (
      select pg_sleep(${sleepSeconds})
    )
    insert into recipes_test (id, name)
    values (10, 'ten')
    returning *
  `),
).resolves.toMatchObject({
  id: 10,
  name: 'ten',
})
```

### mocking

```typescript
const fakeDb = pgMem.newDb() // https://www.npmjs.com/package/pg-mem
const client = createClient('postgresql://', {
  wrapQueryFn: () => {
    return async query => {
      // not a great way to do pass to pg-mem, in search of a better one: https://github.com/oguimbal/pg-mem/issues/384
      let statement = pgSqlAstParser.parse(query.sql)
      statement = JSON.parse(JSON.stringify(statement), (key, value) => {
        if (value?.type === 'parameter' && typeof value?.name === 'string') {
          const literalValue = query.values[Number(value.name.slice(1)) - 1]
          return {type: 'string', value: literalValue}
        }
        return value
      })
      return fakeDb.public.query(statement)
    }
  },
})

await client.query(sql`create table recipes_test(id int, name text)`)

const insert = await client.one(sql`insert into recipes_test(id, name) values (${10}, 'ten') returning *`)
expect(insert).toMatchObject({id: 10, name: 'ten'})

const select = await client.any(sql`select name from recipes_test`)
expect(select).toMatchObject([{name: 'ten'}])
```
<!-- codegen:end -->

## Comparison with slonik

- The API is inspired by Slonik, or rather what Slonik used to be/I wish it still were. The "driver" for the client is pg-promise. But the query API and `sql` tag design is from Slonik. So, mostly, you can use this as a drop-in replacement for slonik.

Generally, usage of a _client_ (or pool, to use the slonik term), should be identical. Initialization is likely different. Some differences which would likely require code changes if migrating from slonik:

- Most slonik initialization options are not carried over. I haven't come across any abstractions which invented by slonik which don't have simpler implementations in the underlying layer or in pg-promise. Specifically:

- type parsers: just use `pg.types.setTypeParser`. Some helper functions to achieve parity with slonik, and this library's recommendations are available, but they're trivial and you can just as easily implement them yourself.
- interceptors: Instead of interceptors, which require book-keeping in order to do things as simple as tracking query timings, there's an option to wrap the core `query` function this library calls. The wrapped function will be called for all query methods. For the other slonik interceptors, you can use `pg-promise` events.
- custom errors: when a query produces an error, this library will throw an error with the corresponding message, along with a tag for the query which caused it. Slonik wraps each error type with a custom class. From a few years working with slonik, the re-thrown errors tend to make the useful information in the underlying error harder to find (less visible in Sentry, etc.). The purpose of the wrapper errors is to protect against potentially changing underlying errors, but there are dozens of breaking changes in Slonik every year, so pgkit opts to rely on the design and language chosen by PostgreSQL instead.
- no `stream` support yet
- See [future](#👽-future) for more details/which parity features are planned

### Added features/improvements

#### `sql`

Interestingly, slonik _removed_ the ability to use the `sql` tag directly, when Gajus decided he wanted to start using zod parsers. There were [many](https://github.com/gajus/slonik/pull/371) [attempts](https://github.com/gajus/slonik/issues/514) [to](https://github.com/gajus/slonik/pull/369) [point](https://github.com/gajus/slonik/pull/387#issuecomment-1222568619) [out](https://github.com/gajus/slonik/issues/410) [other](https://github.com/gajus/slonik/issues/514) [use-cases](https://github.com/gajus/slonik/issues/527) [and](https://github.com/gajus/slonik/pull/512) [options](https://github.com/gajus/slonik/pull/512), but to no avail.

In slonik, you need to use `sql.unsafe`, which is untyped. Note that recommendation is never to use it, and there's been some indication that even this will go away, but there are many examples of its usage in the slonik readme.

With slonik:

```ts
const profile = await slonik.one(sql.unsafe`select * from profile`)
//    👆 has type `any`                    👆 no generic typearg supported
```

With @pgkit/client:

```ts
const profile = await client.one(sql<Profile>`select * from profile`)
//    👆 has type `Profile`
```

#### `sql.raw`

Slonik doesn't let you do this, but there are certain cases when you need to run a SQL query directly. Note that, as the name implies, this is somewhat dangerous. Make sure you trust the query you pass into this.

```ts
const query = 'select 1 as foo'
await client.query(sql.raw(query))
```

(P.S., even though slonik claims to not allow this - it doesn't actually have a a way to stop you. here's how in practice people achieve the same in slonik - it's more confusing to look at, but lacks the "raw" label despite being equally dangerous, which is why pgkit opts to support it):

```ts
const query = 'select 1 as foo'

const result = await pool.one({
  parser: z.any(),
  sql: query,
  type: 'SLONIK_TOKEN_QUERY',
  values: [],
})
```

#### Non-readonly output types

Unfortunately, slonik's output types are marked `readonly`, which means [they're unnecessarily awkward to work with](https://github.com/gajus/slonik/issues/218). For example, you can't pass them to a normal utility function which hasn't marked its inputs as `readonly` (even if it doesn't mutate the array). For example:

```ts
const groupBy = <T>(list: T[], fn: (item: T) => string) => {
  const groups = {} as Record<string, T[]>
  list.forEach(item => (groups[fn(item)] ||= []).push(item))
  return groups
}

const profiles = await slonik.any(sql.type(Profile)`select * from profile`)

const byEmailHost = groupBy(profiles, p => p.email.split('@')[1])
//                          👆 type error: `profiles` is readonly, but groupBy accepts a regular array.
```

It's avoidable by making sure _all_ utility functions take readonly inputs, but this is a pain, and not always practical when the utility function comes from a separate library, and sometimes even leads to unnecessary calls to `.slice()`, or dangerous casting, in practice.

#### Errors

Errors from the underlying driver are wrapped but the message is not changed. A prefix corresponding to the query name is added to the message.

For errors based on the number of rows returned (for `one`, `oneFirst`, `many`, `manyFirst` etc.) the query and result are added to the `cause` property.

<details>
<summary>Here's what some sample errors look like</summary>

<!-- codegen:start {preset: markdownFromTests, source: test/errors.test.ts, headerLevel: 5} -->
##### one error

```typescript
await expect(pool.one(sql`select * from test_errors where id > 1`)).rejects.toMatchInlineSnapshot(
  `
    {
      "message": "[Query select-test_errors_36f5f64]: Expected one row",
      "cause": {
        "query": {
          "name": "select-test_errors_36f5f64",
          "sql": "select * from test_errors where id > 1",
          "token": "sql",
          "values": []
        },
        "result": {
          "rows": [
            {
              "id": 2,
              "name": "two"
            },
            {
              "id": 3,
              "name": "three"
            }
          ]
        }
      }
    }
  `,
)
```

##### maybeOne error

```typescript
await expect(pool.maybeOne(sql`select * from test_errors where id > 1`)).rejects.toMatchInlineSnapshot(`
  {
    "message": "[Query select-test_errors_36f5f64]: Expected at most one row",
    "cause": {
      "query": {
        "name": "select-test_errors_36f5f64",
        "sql": "select * from test_errors where id > 1",
        "token": "sql",
        "values": []
      },
      "result": {
        "rows": [
          {
            "id": 2,
            "name": "two"
          },
          {
            "id": 3,
            "name": "three"
          }
        ]
      }
    }
  }
`)
```

##### many error

```typescript
await expect(pool.many(sql`select * from test_errors where id > 100`)).rejects.toMatchInlineSnapshot(`
  {
    "message": "[Query select-test_errors_34cad85]: Expected at least one row",
    "cause": {
      "query": {
        "name": "select-test_errors_34cad85",
        "sql": "select * from test_errors where id > 100",
        "token": "sql",
        "values": []
      },
      "result": {
        "rows": []
      }
    }
  }
`)
```

##### syntax error

```typescript
await expect(pool.query(sql`select * frooom test_errors`)).rejects.toMatchInlineSnapshot(`
  {
    "message": "[Query select_fb83277]: syntax error at or near \\"frooom\\"",
    "pg_code": "42601",
    "pg_code_name": "syntax_error",
    "cause": {
      "query": {
        "name": "select_fb83277",
        "sql": "select * frooom test_errors",
        "token": "sql",
        "values": []
      },
      "error": {
        "length": 95,
        "name": "error",
        "severity": "ERROR",
        "code": "42601",
        "position": "10",
        "file": "scan.l",
        "line": "1145",
        "routine": "scanner_yyerror",
        "query": "select * frooom test_errors"
      }
    }
  }
`)

const err: Error = await pool.query(sql`select * frooom test_errors`).catch(e => e)

expect(err.stack).toMatchInlineSnapshot(`
  Error: [Query select_fb83277]: syntax error at or near "frooom"
      at Object.query (<repo>/packages/client/src/client.ts:<line>:<col>)
      at <repo>/packages/client/test/errors.test.ts:<line>:<col>
`)

expect((err as QueryError).cause?.error?.stack).toMatchInlineSnapshot(`
  error: syntax error at or near "frooom"
      at Parser.parseErrorMessage (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/parser.ts:<line>:<col>)
      at Parser.handlePacket (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/parser.ts:<line>:<col>)
      at Parser.parse (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/parser.ts:<line>:<col>)
      at Socket.<anonymous> (<repo>/node_modules/.pnpm/pg-protocol@1.6.0/node_modules/pg-protocol/src/index.ts:<line>:<col>)
`)
```
<!-- codegen:end -->

</details>

### Missing features

#### `connection.stream`

At time of writing, @pgkit/client does not support streaming queries yet. You can always drop down to the the pg-promise driving client to achieve this though.

#### Interceptors

Instead of interceptors, which require book-keeping in order to do things as simple as tracking query timings, there's an option to wrap the core `query` function this library calls. The wrapped function will be called for all query methods. For the other slonik interceptors, you can use `pg-promise` events.

## 👽 Future

Some features that will be added to @pgkit/client at some point, that may or may not be in slonik too:

- an analogue of the [QueryFile](https://vitaly-t.github.io/pg-promise/QueryFile.html) concept in pg-promise. This will be integrated with `@pgkit/typegen` to enable an API something like `await client.any(sql.file('my-file.sql'))`
- an analogue of the [PerparedStatement](https://vitaly-t.github.io/pg-promise/PreparedStatement.html) concept in pg-promise.
- support for specifying the types of parameters in SQL queries as well as results. For example, `` sql`select * from profile where id = ${x} and name = ${y} `` - we can add type-safety to ensure that `x` is a number, and `y` is a string (say)
- first-class support for query **naming**. Read [Show Your Query You Love It By Naming It](https://www.honeycomb.io/blog/naming-queries-made-better) from the fantastic HoneyComb blog for some context on this.
- a `pgkit` monopackage, which exposes this client, as well as the above packages, as a single dependency. TBD on how to keep package size manageable - or whether that's important given this will almost always be used in a server environment
- equivalents to the ["Community interceptors" in the slonik docs](https://www.npmjs.com/package/slonik#community-interceptors) - mostly as an implementation guide of how they can be achieved, and to verify that there's no functional loss from not having interceptors.
