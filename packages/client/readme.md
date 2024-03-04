# @pgkit/client

A strongly-typed postgres client for node.js

## Contents

<!-- codegen:start {preset: markdownTOC}-->
- [Contents](#contents)
- [API](#api)
   - [sql.array:](#sqlarray)
   - [sql.identifier:](#sqlidentifier)
   - [sql.unnest:](#sqlunnest)
   - [sql.join:](#sqljoin)
   - [sql.fragment:](#sqlfragment)
   - [sql.interval:](#sqlinterval)
   - [sql.binary:](#sqlbinary)
   - [sql.json:](#sqljson)
   - [sql.jsonb:](#sqljsonb)
   - [sql.literalValue:](#sqlliteralvalue)
   - [sub-transactions:](#sub-transactions)
   - [transaction savepoints:](#transaction-savepoints)
   - [query timeout:](#query-timeout)
   - [sql.type:](#sqltype)
   - [sql.typeAlias:](#sqltypealias)
- [Get started](#get-started)
- [Types](#types)
   - [Zod](#zod)
- [Comparison with slonik](#comparison-with-slonik)
   - [Added features/improvements](#added-featuresimprovements)
   - [`sql`](#sql)
   - [`sql.raw`](#sqlraw)
   - [Non-readonly output types](#non-readonly-output-types)
   - [Errors](#errors)
      - [one error:](#one-error)
      - [maybeOne error:](#maybeone-error)
      - [many error:](#many-error)
      - [syntax error:](#syntax-error)
- [Ecosystem](#ecosystem)
- [👽 Future](#-future)
<!-- codegen:end -->

## API

<!-- codegen:start {preset: markdownFromTests, source: test/api-usage.test.ts, headerLevel: 3} -->
### sql.array:

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

### sql.identifier:

```typescript
const result = await client.oneFirst(sql`
  select count(1)
  from ${sql.identifier(['public', 'usage_test'])}
`)

expect(Number(result)).toEqual(3)
```

### sql.unnest:

```typescript
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
```

### sql.join:

```typescript
const [result] = await client.any(sql`
  update usage_test
  set ${sql.join([sql`name = 'one hundred'`, sql`id = 100`], sql`, `)}
  where id = 1
  returning *
`)

expect(result).toEqual({id: 100, name: 'one hundred'})
```

### sql.fragment:

```typescript
const condition = sql.fragment`id = 1`

const result = await client.one(sql`select * from usage_test where ${condition}`)
expect(result).toEqual({id: 1, name: 'one'})
```

### sql.interval:

```typescript
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
```

### sql.binary:

```typescript
const result = await client.oneFirst(sql`
  select ${sql.binary(Buffer.from('hello'))} as b
`)
expect(result).toMatchInlineSnapshot(`"\\x68656c6c6f"`)
```

### sql.json:

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

const insert3 = await client.one(sql`
  insert into jsonb_test values (1, ${JSON.stringify({foo: 'bar'})})
  returning *
`)

expect(insert3).toEqual(insert)
```

### sql.jsonb:

```typescript
const insert2 = await client.one(sql`
  insert into jsonb_test values (1, ${sql.jsonb({foo: 'bar'})})
  returning *
`)

expect(insert2).toEqual(insert2)
```

### sql.literalValue:

```typescript
const result = await client.transaction(async tx => {
  await tx.query(sql`set local search_path to ${sql.literalValue('abc')}`)
  return tx.one(sql`show search_path`)
})

expect(result).toEqual({search_path: 'abc'})
const result2 = await client.one(sql`show search_path`)
expect(result2).toEqual({search_path: '"$user", public'})
```

### sub-transactions:

```typescript
const result = await client.transaction(async t1 => {
  const count1 = await t1.oneFirst(sql`select count(1) from usage_test where id > 3`)
  const count2 = await t1.transaction(async t2 => {
    await t2.query(sql`insert into usage_test(id, name) values (5, 'five')`)
    return t2.oneFirst(sql`select count(1) from usage_test where id > 3`)
  })
  return {count1, count2}
})

expect(result).toEqual({count1: 0, count2: 1})
```

### transaction savepoints:

```typescript
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
```

### query timeout:

```typescript
const shortTimeout = 20
const impatient = createClient(client.connectionString() + '?shortTimeout', {
  pgpOptions: {
    connect: ({client}) => {
      client.connectionParameters.query_timeout = shortTimeout
    },
  },
})
const patient = createClient(client.connectionString() + '?longTimeout', {
  pgpOptions: {
    connect: ({client}) => {
      client.connectionParameters.query_timeout = shortTimeout * 3
    },
  },
})

const sleepMs = (shortTimeout * 2) / 1000
await expect(impatient.one(sql`select pg_sleep(${sleepMs})`)).rejects.toThrowErrorMatchingInlineSnapshot(
  `[Error: [Query select_9dcc021]: Query read timeout]`,
)
await expect(patient.one(sql`select pg_sleep(${sleepMs})`)).resolves.toMatchObject({
  pg_sleep: '',
})
```

### sql.type:

```typescript
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
```

### sql.typeAlias:

```typescript
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
```
<!-- codegen:end -->

## Get started

```
npm install @pgkit/client
```

```ts
import {sql, createClient} from '@pgkit/client'

const client = createClient('postgres://postgres:postgres@localhost:5432/postgres')

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

## Types

The companion library [@pgkit/typegen](https://npmjs.com/package/@pgkit/typegen) will add typescript types to your queries. This offers a pretty unique developer experience. You get the type-safety of an ORM, but without any of the tradeoffs: no vendor lock-in, no having to learn how to use the ORM rather than PostgreSQL, no non-performant queries, no limitations on the queries you can run.

Check out the typegen package for more details, but essentially it will analyse your SQL queries, and map PostgreSQL types to TypeScript, to transform code like this:

```ts
const profiles = await client.any(sql`select * from profile`)
```

Into this:

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

Alternatively, you can manually define the type for a query:

```ts
const profiles = await client.any(sql<{id: string; name: string}>`select * from profile`)
//    👆 will have type `Array<{id: string; name: string}>`
```

### Zod

If you like, you can use [zod](https://npmjs.com/package/zod) to parse query results:

```ts
const Profile = z.object({id: z.string(), name: z.string()})

const profiles = await client.any(sql.type(Profile)`select * from profile`)
```

This will use zod to validate each row returned by your query.

Note that zod is not a dependency of this library, nor even a peer dependency. In fact, you could use a different library entirely, as long as you provide a "type" which has a `parse` method:

```ts
import * as v from 'valibot'

const ProfileSchema = v.object({id: v.string(), name: v.string()})
const Profile = {
    parse: (input: unknown) => v.parse(ProfileSchema, input),
}

const profiles = await client.any(sql.type(Profile)`select * from profile`)
```

## Comparison with slonik

- The API is inspired by Slonik, or rather what Slonik used to be/I wish it still were. The "driver" for the client is pg-promise. But the query API and `sql` tag design is from Slonik. So, mostly, you can use this as a drop-in replacement for slonik.

Generally, usage of a _client_ (or pool, to use the slonik term), should be identical. Initialization is likely different. Some differences which would likely require code changes if migrating from slonik:

- Most slonik initialization options are not carried over. I haven't come across any abstractions which invented by slonik which don't have simpler implementations in the underlying layer or in pg-promise. Specifically:

- type parsers: just use `pg.types.setTypeParser`. Some helper functions to achieve parity with slonik, and this library's recommendations are available, but they're trivial and you can just as easily implement them yourself.
- interceptors: Instead of interceptors, which require book-keeping in order to do things as simple as tracking query timings, there's an option to wrap the core `query` function this library calls. The wrapped function will be called for all query methods. For the other slonik interceptors, you can use `pg-promise` events.
- custom errors: when a query produces an error, this library will throw an error with the corresponding message, along with a tag for the query which caused it. Slonik wraps each error type with a custom class. From a few years working with slonik, the re-thrown errors tend to make the useful information in the underlying error harder to find (less visible in Sentry, etc.). The purpose of the wrapper errors is to protect against potentially changing underlying errors, but there are dozens of breaking changes in Slonik every year, so pgkit opts to rely on the design and language chosen by PostgreSQL instead.

### Added features/improvements

### `sql`

Interestingly, slonik _removed_ the ability to use the `sql` tag directly, when Gajus decided he wanted to start using zod parsers. There were [many](https://github.com/gajus/slonik/pull/371) [attempts](https://github.com/gajus/slonik/issues/514) [to](https://github.com/gajus/slonik/pull/369) [point](https://github.com/gajus/slonik/pull/387#issuecomment-1222568619) [out](https://github.com/gajus/slonik/issues/410) [other](https://github.com/gajus/slonik/issues/514) [use-case](https://github.com/gajus/slonik/issues/527) [and](https://github.com/gajus/slonik/pull/512) [options](https://github.com/gajus/slonik/pull/512), but to no avail.

In slonik, you need to use `sql.unsafe`, which is untyped. Note that recommendation is never to use it, and there's been some indication that even this will go away, but there are many examples of its usage in the slonik readme:

```ts
const profile = await client.one(sql.unsafe`select * from profile`)
//    👆 has type `any`                    👆 no generic typearg supported
```

In @pgkit/client:

```ts
const profile = await client.one(sql<Profile>`select * from profile`)
//    👆 has type `Profile`
```

### `sql.raw`

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

### Non-readonly output types

This one is my fault, really. I was the one who ported slonik to TypeScript, and I carried over some FlowType `readonly`s. Unfortunately, slonik's output types are marked `readonly`, which means [they're quite awkward to work with](https://github.com/gajus/slonik/issues/218). For example, you can't pass them to a normal utility function which hasn't marked its inputs as `readonly` (even if it doesn't mutate the array). For example:

```ts
const groupBy = <T>(list: T[], fn: (item: T) => string) => {
    // ...groupBy implementation
}
const profiles = await client.any(sql.type(Profile)`select * from profile`)

const byEmailHost = groupBy(profiles, p => p.email.split('@')[1])
//                          👆 type error: `profiles` is readonly, but groupBy accepts a regular array.
```

It's fixable by making sure _all_ utility functions take readonly inputs, but this is a pain, and sometimes even leads to unnecessary calls to `.slice()`, or dangerous casting, in practice.

### Errors

Errors from the underlying driver are wrapped but the message is not changed. A prefix corresponding to the query name is added to the message.

For errors based on the number of rows returned (for `one`, `oneFirst`, `many`, `manyFirst` etc.) the query and result are added to the `cause` property.

<details>
<summary>Here's what some sample errors look like</summary>

<!-- codegen:start {preset: markdownFromTests, source: test/errors.test.ts, headerLevel: 4} -->
#### one error:

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

#### maybeOne error:

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

#### many error:

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

#### syntax error:

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

## Ecosystem

@pgkit/client is the basis for these libraries:

- [@pgkit/admin](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/admin#readme) - A zero-config admin UI for running queries against PostgreSQL database, with autocomplete for tables, columns, views, functions etc.
- [@pgkit/migra](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/migra#readme) - A port of @djrobstep's [python migra library](https://github.com/djrobstep/migra).
- [@pgkit/migrator](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/migrator#readme) - A cli migration tool for postgres, using [pgkit](https://npmjs.com/package/@pgkit/client).
- [@pgkit/schemainspect](./packages/schemainspect) - A port of @djrobstep's [python schemainspect library](https://github.com/djrobstep/schemainspect).
- [@pgkit/typegen](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/typegen#readme) - A library that uses [pgkit](https://npmjs.com/package/@pgkit/client) to generate typescript interfaces based on your sql

Note that @pgkit/migra and @pgkit/schemainspect are pure ports of their Python equivalents. They are fantastically useful, and hopefully more and more can be built on top of them in the future.

## 👽 Future

Some features that will be added to @pgkit/client at some point, that may or may not be in slonik too:

- an analogue of the [QueryFile](https://vitaly-t.github.io/pg-promise/QueryFile.html) concept in pg-promise. This will be integrated with `@pgkit/typegen` to enable an API something like `await client.any(sql.file('my-file.sql'))`
- an analogue of the [PerparedStatement](https://vitaly-t.github.io/pg-promise/PreparedStatement.html) concept in pg-promise.
- support for specifying the types of parameters in SQL queries as well as results. For example, `` sql`select * from profile where id = ${x} and name = ${y} `` - we can add type-safety to ensure that `x` is a number, and `y` is a string (say)
- first-class support for query **naming**. Read [Show Your Query You Love It By Naming It](https://www.honeycomb.io/blog/naming-queries-made-better) from the fantastic HoneyComb blog for some context on this.
- a `pgkit` monopackage, which exposes this client, as well as the above packages, as a single dependency. TBD on how to keep package size manageable - or whether that's important given this will almost always be used in a server environment
- equivalents to the ["Community interceptors" in the slonik docs](https://www.npmjs.com/package/slonik#community-interceptors) - mostly as an implementation guide of how they can be achieved, and to verify that there's no functional loss from not having interceptors.
