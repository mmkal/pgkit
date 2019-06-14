# @slonik/typegen

A library that uses [slonik](https://npmjs.com/package/slonik) to generate typescript interfaces based on your sql queries.

## The idea

This library gives you type-safety of an ORM, and the flexibility of sql. Read [@gajus](https://github.com/gajus)'s excellent blog post on why it's a good idea to use sql rather than ORMs or query-builders: [Stop using Knex.js](https://medium.com/@gajus/bf410349856c)

The library will make sure that return values from all your SQL queries have strict, accurate TypeScript interfaces.

It provides gradual ramp to type safety, so you don't have to spend any time manually syncing interfaces. And before the types have been generated, results will be typed as a generic dictionary - meaning you can write your queries and business logic as quickly and easily as before, but the compile will tell you if you got something wrong once you try it out.

Simple select statements, joins, and updates/inserts using `returning` are all supported - any sql query that returns a tabular value will have an interface generated for the row type, which will be automatically applied to the appropriate query result.


## Installation

```bash
npm install @slonik/typegen
npx slonik-typegen src/generated/db # initialises a placeholder directory for generated types
```

## Usage

Then use in typescript (e.g. in a `src/db.ts` file):

```typescript
import {setupTypeGen} from '@slonik/typegen'
import {createPool} from 'slonik'
import {knownTypes} from './generated/db'

export const {sql, poolConfig} = setupTypeGen({
  knownTypes,
  writeTypes: process.env.NODE_ENV !== 'production' && process.cwd() + '/src/generated/db',
})

export const slonik = createPool(process.env.POSTGRES_URI, poolConfig)
export const getPeople = () => slonik.query(sql.Person`select * from person limit 2`)
```

When you first write this code, `getPeople` will have return type `Promise<QueryResultType<any>>`.
But once you run `getPeople()` (say, by normal usage of your application), `@slonik/typegen` will inspect the field types of the query result, and generate a typescript interface for it.

Afterwards, without having to modify any code, `getPeople` will have return type `Promise<QueryResult<Person>>`, where `Person` is defined based on the query. In this case is the schema of the `person` table. This allows you to get started fast - just write a query, and you will be able to use the results, which will be typed as `any`.

This gives you strong typing, like in an ORM, but avoids the [inner-platform effect](https://en.wikipedia.org/wiki/Inner-platform_effect) that tends to come with them. You just write regular SQL queries - you can rename columns, do any kinds of join you want, and the types generated will be based on the _query_, not the _table_, so you won't be limited by ORM feature-sets.

The code generation is opt-in. You have to provide a path for the tool to write the generated code. It is strongly recommended you don't generate code in production (the example above relies on a simple check of the `NODE_ENV` environment variable). When a falsy value is supplied to `writeTypes`, `sql.Person` becomes slonik's `sql` template function.

## Configuration

| property | description | default value |
|--------|------------|-------------|
| `writeTypes` | location to write generated typescript. if this is undefined (or falsy) no types will be written. | `false` |
| `knownTypes` | object produced by this library's codegen. By referencing the export produced in the location set by `writeTypes`, types will gradually improve without adding any code per query. | `undefined` |
| `knownTypes.defaultType` | by setting this, you can force any unknown/new queries to be given a particular type. For example, in development, you may want a new query to be typed as `any` while you're writing code. | `undefined` |
| `typeMapper` | custom mapper from postgres type name to typescript type as a string, as well as a corresponding function mapping the runtime values - see examples using `Date` and a custom enum in [the tests](https://github.com/mmkal/slonik-tools/blob/master/packages/typegen/test/index.test.ts). | `undefined` |
| `reset` | if true, generated code directory will be wiped and reinitialised on startup. | `false` |

## Examples

[The tests](https://github.com/mmkal/slonik-tools/blob/master/packages/typegen/test/index.test.ts) are a good starting point to see a few different configurations.

## How it works

The function `setupTypeGen` returns a special `sql` proxy object, which allows accessing any string key. When you access a key, it's considered as a query identifier. You'll get a wrapped version of slonik's `sql` tagged template variable. When you use it with a tagged template, @slonik/typegen will remember your query and store the identifier against it. `setupTypeGen` also returns a slonik interceptor, defining a hook to be run after every query is executed. The hook looks up the query identifier from the query taht was run, and generates a typescript interface from the field metadata provided by postgres. The interface is written to disk, and added to the `KnownTypes` definition. The typescript compiler will then automatically gain type information corresponding to that query.

## Recommendations

1. You can re-use the same type name for many queries. But you should only do this if the types represented by any single name are the same, since the resultant type will be a union of all of the outputs (meaning `A | B` - i.e. only fields common to both will be accessible).
1. Check in the types to source control. They're generated code, but it makes it much easier to track what was happened when a query was update, and see those changes over history.
1. After running CI, it's worth making sure that there are no working copy changes. For git, you can use [check-clean](https://npmjs.com/package/check-clean):

```sh
npm run test:integration
npx check-clean
```
