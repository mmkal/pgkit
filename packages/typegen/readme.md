# @slonik/typegen

[![Node CI](https://github.com/mmkal/slonik-tools/workflows/CI/badge.svg)](https://github.com/mmkal/slonik-tools/actions?query=workflow%3ACI)
[![codecov](https://codecov.io/gh/mmkal/slonik-tools/branch/master/graph/badge.svg)](https://codecov.io/gh/mmkal/slonik-tools)

A library that uses [slonik](https://npmjs.com/package/slonik) to generate typescript interfaces based on your sql queries.

## The idea

This library gives you the type-safety of an ORM (in some cases, even more), while maintaining the flexibility of sql. Read [@gajus](https://github.com/gajus)'s excellent blog post on why it's a good idea to use sql rather than ORMs or query-builders: [Stop using Knex.js](https://medium.com/@gajus/bf410349856c).

The library will make sure that return values from all your SQL queries have strict, accurate TypeScript interfaces.

It works by scanning your source code, so you don't have to spend any time manually syncing interfaces. Write queries using the `sql` tag as normal, then run the CLI to apply strong types to them automatically. The compiler will then tell you if you got something wrong.

This method avoids the [inner-platform effect](https://en.wikipedia.org/wiki/Inner-platform_effect) that tends to come with ORMs. You can rename columns, call functions, use sub-select statements, do any kinds of join you want, and the types generated will be based on the _query_, not the _table_, so you won't be limited by ORM feature-sets.

Select statements, joins, and updates/inserts using `returning` are all supported - any sql query that returns a tabular value will have an interface generated for the row type. The interface will be automatically applied to the appropriate query result.

## Contents

<!-- codegen:start {preset: markdownTOC, sort: package.name, minDepth: 2} -->
- [The idea](#the-idea)
- [Contents](#contents)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Examples](#examples)
- [Migration from v0.8.0](#migration-from-v080)
- [SQL files](#sql-files)
- [Limitations](#limitations)
- [How it works](#how-it-works)
- [Recommendations](#recommendations)
<!-- codegen:end -->

## Installation

```bash
npm install @slonik/typegen
```

## Usage

```bash
npx slonik-typegen generate
```

The above command will generate types using sensible default values. It will look for code in a `src` directory, and create interfaces for all `sql`-tagged queries it finds - e.g.

Before:
```ts
import {sql} from 'slonik'

sql`select foo, bar from baz`
```

After:

```ts
import {sql} from 'slonik'
```

## Configuration

The CLI can run with zero config, but there will often be customisations needed depending on your project's setup. By default, the CLI will look for `typegen.config.js` file in the working directory. The config file can contain the following options (all are optional):

- `rootDir` - Source root that the tool will search for files in. Defaults to `src`. Can be overridden with the `--root-dir` CLI argument.
- `glob` - Glob pattern of files to search for. Defaults to searching for `.ts` and `.sql` files, ignore `node_modules`. Can be overridden with the `--glob` CLI argument.
- `pool` - Slonik database pool instance. Will be used to issue queries to the database as the tool is running, and will have its type parsers inspected to ensure the generated types are correct. It's important to pass in a pool instance that's configured the same way as the one used in your application.
- `psqlCommand` - the CLI command for running the official postgres `psql` CLI client. Defaults to `psql -h localhost -U postgres postgres`. You can test it's working with `echo 'select 123 as abc' | psql -h localhost -U postgres postgres -f -`. Note that right now this can't contain single quotes. This should also be configured to talk to the same database as the `pool` variable (and it should be a development database - don't run this tool in production!)
- `logger` - Logger object with `debug`, `info`, `warn` and `error` methods. Defaults to `console`.

There are some more configuration options [documented in code](./src/gdesc/types.ts) but these should be considered experimental, and might change without warning. If you want to use them, please start a [discussion](https://github.com/mmkal/slonik-tools/discussions) on this library's project page.

## Examples

[The test fixtures](./test/fixtures) are a good starting point to see what the code-generator will do.

## Migration from v0.8.0

Version 0.8.0 and below of this library used a different style of code-generation. It had several drawbacks - it was a runtime dependency, and required queries to be actually run before types could be inferred. It also created a global repository of types, meaning two queries in separate locations which shared a name could clash with each other. It also required changing the way your code was written.

Conceptually, this library now does more work so you don't have to worry about it so much. Just write slonik code/queries as normal, and then run the CLI to add types to them. If you add a new column to any query, run it again to update the interfaces.

If you previously used the old version of the tool, you can run it once with the  `--migrate v0.8.0` CLI argument to automatically attempt to codemod your project. Note that this will, by default, check that your git status is clean before running since it modifies code in place. The codemod isn't advanced enough to find all usages of the old API, so have a look through what it does after running it to make sure the changes look OK. If they aren't, reset the git changes and either apply them manually and/or pass in a different `glob` value to avoid files that were incorrectly modified.

## SQL files

The tool will also search for `.sql` files, and generate some typescript helpers for running the queries contained in them. Any parameters (`$1`, `$2` etc.) will also be strongly typed, and become required inputs for running the query. See the [SQL file fixtures](./test/fixtures/sql.test.ts) for some examples.

## Limitations

Some dynamically-generated queries will not receive a type. One example is any query where the template express parameters are identifiers rather than values, e.g.

```ts
import {sql} from 'slonik'

const tableName = Math.random() < 0.5 ? 'foo' : 'bar'

export default sql`select * from ${sql.identifier([tableName])}`
```

In the above example, no type can be inferred because it's impossible to know whether the query will return values from table `foo` or `bar`.

___

Queries with multiple statements will also not receive a type:

```ts
import {sql} from 'slonik'

export default sql`
  insert into foo(a, b) values (1, 2);
  insert into foo(a, b) values (3, 4);
`
```

This kind of query does not return a value when executed anyway.

___

Invalid SQL syntax will also be left untouched (they will result in an error being logged when running the CLI):

```ts
import {sql} from 'slonik'

export default sql`this is not even valid SQL!`
```

If you see errors being logged for SQL that you think is valid, feel free to [raise an issue](https://github.com/mmkal/slonik-tools/issues/new).

___

Finally, for some complex queries, static parsing might fail, making it not possible to determine statically if a column is nullable. If this happens, it will still receive a valid type, but the type will be `string | null` rather than `string`.

If you find such a case, please [raise an issue](https://github.com/mmkal/slonik-tools/issues/new) to see if it's possible to handle - under the hood this library uses [pgsql-ast-parser](https://npmjs.com/package/pgsql-ast-parser) and you might have found an edge case which that library doesn't handle yet.

## How it works

When you run `slonik-typegen generate`, the tool will scan your source files, and traverse their ASTs using the TypeScript compiler API. Note that typescript is a peer dependency for this reason.

On finding a sql query, it will issue a `psql` command using the flag `\gdesc`, which responds with a table of the columns and their corresponding types contained in the query. The query itself is never actually run.

The postgres type is then converted into typescript using an in-built mapping. Any slonik `typeParsers` configured (see [slonik docs](https://github.com/gajus/slonik/#api) for more info) are inspected to infer the type of the value that will be returned by the query.

To determine whether query columns are nullable, the query is parsed using [pgsql-ast-parser](https://npmjs.com/package/pgsql-ast-parser). Some more queries are sent to postgres to figure out whether query column can be null - in general, postgres is only able to guarantee if a query column is null if it comes directly from a table which declares that column non-null too.

## Recommendations

1. You can re-use the same type name for many queries. But you should only do this if the types represented by any single name are the same, since the resultant type will be a union of all of the outputs (meaning `A | B` - i.e. only fields common to both will be accessible).
1. Check in the types to source control. They're generated code, but it makes it much easier to track what was happened when a query was update, and see those changes over time.
1. After running CI, it's worth making sure that there are no working copy changes. For git, you can use [check-clean](https://npmjs.com/package/check-clean):

```sh
yarn test:integration
npx check-clean
```
