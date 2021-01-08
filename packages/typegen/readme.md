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
   - [Example config](#example-config)
   - [CLI options](#cli-options)
   - [Modifying types](#modifying-types)
   - [Modifying source files](#modifying-source-files)
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

<!-- codegen:start {preset: custom, source: ./docgen.js, export: basicExample} -->
For a table defined with:

```sql
create table test_table(foo int not null, bar text);

comment on column test_table.bar is 'Look, ma! A comment from postgres!'
```

Source code before:

```ts
import {sql, createPool} from 'slonik'

export default async () => {
  const pool = createPool('...connection string...')

  const results = await pool.query(sql`select foo, bar from test_table`)

  results.rows.forEach(r => {
    console.log(r.foo)
    console.log(r.bar)
  })
}
```

Source code after:

```ts
import {sql, createPool} from 'slonik'

export default async () => {
  const pool = createPool('...connection string...')

  const results = await pool.query(sql<queries.TestTable>`select foo, bar from test_table`)

  results.rows.forEach(r => {
    console.log(r.foo) // foo has type 'number'
    console.log(r.bar) // bar has type 'string | null'
  })
}

export module queries {
  /** - query: `select foo, bar from test_table` */
  export interface TestTable {
    /** column: `example_test.test_table.foo`, not null: `true`, regtype: `integer` */
    foo: number

    /**
     * Look, ma! A comment from postgres!
     *
     * column: `example_test.test_table.bar`, regtype: `text`
     */
    bar: string | null
  }
}
```
<!-- codegen:end -->

## Configuration

The CLI can run with zero config, but there will usually be customisations needed depending on your project's setup. By default, the CLI will look for `typegen.config.js` file in the working directory. The config file can contain the following options (all are optional):

- `rootDir` - Source root that the tool will search for files in. Defaults to `src`. Can be overridden with the `--root-dir` CLI argument.
- `glob` - Glob pattern of files to search for. Defaults to searching for `.ts` and `.sql` files, ignore `node_modules`. Can be overridden with the `--glob` CLI argument.
- `pool` - Slonik database pool instance. Will be used to issue queries to the database as the tool is running, and will have its type parsers inspected to ensure the generated types are correct. It's important to pass in a pool instance that's configured the same way as the one used in your application.
- `psqlCommand` - the CLI command for running the official postgres `psql` CLI client. Defaults to `psql -h localhost -U postgres postgres`. You can test it's working with `echo 'select 123 as abc' | psql -h localhost -U postgres postgres -f -`. Note that right now this can't contain single quotes. This should also be configured to talk to the same database as the `pool` variable (and it should be a development database - don't run this tool in production!)
- `logger` - Logger object with `debug`, `info`, `warn` and `error` methods. Defaults to `console`.

### Example config

Here's a valid example config file.

```js
const yourAppDB = require('./lib/db')

/** @type {import('@slonik/typegen').Options} */
module.exports = {
  rootDir: 'source', // maybe you're sindresorhus and you don't like using `src`
  glob: ['{queries/**.ts,sql/**.sql}', {ignore: 'legacy-queries/**.sql'}],
  pool: yourAppDB.getPool(),
}
```

Note that the `/** @type {import('@slonik/typegen').Options} */` comment is optional, but will ensure your IDE gives you type hints.

### CLI options

Some of the options above can be overriden by the CLI:

<!-- codegen:start {preset: custom, source: ./docgen.js, export: cliHelpText} -->
```
usage: slonik-typegen generate [-h] [--config PATH] [--root-dir PATH]
                               [--connection-uri URI] [--psql COMMAND]
                               [--default-type TYPESCRIPT] [--glob PATTERN]
                               

Generates a directory containing with a 'sql' tag wrapper based on found 
queries found in source files. By default, searches 'src' for source files.

Optional arguments:

  -h, --help            Show this help message and exit.

  --config PATH         Path to a module containing parameters to be passed 
                        to 'generate'. If specified, it will be required and 
                        the export will be used as parameters. If not 
                        specified, defaults will be used. Note: other CLI 
                        arguments will override values set in this module

  --root-dir PATH       Path to the source directory containing SQL queries. 
                        Defaults to 'src if no value is provided

  --connection-uri URI  URI for connecting to postgres. Defaults to 
                        URI for connecting to postgres. Defaults to 

  --psql COMMAND        psql command used to query postgres via CLI client. e.
                        g. 'psql -h localhost -U postgres postgres' if 
                        running postgres locally, or 'docker-compose exec -T 
                        postgres psql -h localhost -U postgres postgres' if 
                        running with docker-compose. You can test this by 
                        running "<<your_psql_command>> -c 'select 1 as a, 2 
                        as b'". Note that this command will be executed 
                        dynamically, so avoid using any escape characters in 
                        here.

  --default-type TYPESCRIPT
                        TypeScript fallback type for when no type is found. 
                        Most simple types (text, int etc.) are mapped to 
                        their TypeScript equivalent automatically. This 
                        should usually be 'unknown', or 'any' if you like to 
                        live dangerously.

  --glob PATTERN        Glob pattern of source files to search for SQL 
                        queries in. By default searches for all ts, js, sql, 
                        cjs and mjs files under 'rootDir'
```
<!-- codegen:end -->

There are some more configuration options [documented in code](./src/types.ts) but these should be considered experimental, and might change without warning. You can try them out as documented below, but please start a [discussion](https://github.com/mmkal/slonik-tools/discussions) on this library's project page with some info about your use case so the API can be stabilised in a sensible way.

### Modifying types

You can modify the types generated before they are written to disk by defining a custom `writeTypes` implementation:

```js
const typegen = require('@slonik/typegen')

/** @type {import('@slonik/typegen').Options} */
module.exports = {
  writeTypes: queries => {
    queries.forEach(query => {
      query.fields.forEach(field => {
        // add a `_brand` to all string id fields:
        if (field.typescript === 'string' && field.column && field.column.name === '.id') {
          field.typescript = `(${field.typescript} & { _brand: ${JSON.stringify(field.column)} })`
        }
      })
    })

    return typegen.defaultWriteTypes()(queries)
  }
}
```

Or you could mark all fields as non-null (but probably shouldn't!):

```js
const typegen = require('@slonik/typegen')

/** @type {import('@slonik/typegen').Options} */
module.exports = {
  writeTypes: queries => {
    queries.forEach(query => {
      query.fields.forEach(field => {
        field.notNull = true
      })
    })

    return typegen.defaultWriteTypes()(queries)
  }
}
```

Or you could use a custom type for json fields:

```js
const typegen = require('@slonik/typegen')

/** @type {import('@slonik/typegen').Options} */
module.exports = {
  writeTypes: queries => {
    queries.forEach(query => {
      query.fields.forEach(field => {
        if (field.regtype === 'json' || field.regtype === 'jsonb') {
          field.typescript = `import('@your-project/custom-types').YourCustomType`
          // For more customisation, you could look up which type to use based on `field.column`.
        }
      })
    })

    return typegen.defaultWriteTypes()(queries)
  }
}
```

### Modifying source files

You can also use `writeTypes` to define a hook that runs before writing to disk:

```js
const typegen = require('@slonik/typegen')

/** @type {import('@slonik/typegen').Options} */
module.exports = {
  writeTypes: typegen.defaultWriteTypes({
    writeFile: async (filepath, content) => {
      content = content.replace(/queries/g, 'querieeeez')
      await typegen.write.writeFile(filepath, content)
    },
  })
}
```

Or you could override the default formatter (which uses prettier, if found):

```js
const typegen = require('@slonik/typegen')
const yourCustomLinter = require('@your-project/custom-linter')
const fs = require('fs')
const path = require('path')

/** @type {import('@slonik/typegen').Options} */
module.exports = {
  writeTypes: typegen.defaultWriteTypes({
    writeFile: async (filepath, content) => {
      content = await yourCustomLinter.fix(filepath, content)
      await fs.promises.mkdir(path.dirname(filepath), {recursive: true}) // since you're not using the built-in `writeFile` you need to do this yourself
      await fs.promises.writeFile(filepath, content)
    },
  })
}
```

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

Queries using the `pg_temp` schema will usually not be typeable since the schema is ephemeral and only can be queried within a single session that `psql` doesn't have access to.

```ts
import {sql} from 'slonik'

export default sql`select * from pg_temp.my_temp_table`
```

___

Invalid SQL syntax will also be left untouched (they will result in an error being logged when running the CLI):

```ts
import {sql} from 'slonik'

export default sql`this is not even valid SQL!`
```

If you see errors being logged for SQL that you think is valid, feel free to [raise an issue](https://github.com/mmkal/slonik-tools/issues/new). In the meantime, you can create a variable `const _sql = sql` and use the `_sql` tag in the same way as `sql`. `_sql` will not be detected by the tool and can be used as normal.

___

Finally, for some complex queries, static parsing might fail, making it not possible to determine statically if a column is nullable. If this happens, it will still receive a valid type, but the type will be `string | null` rather than `string`.

If you find such a case, please [raise an issue](https://github.com/mmkal/slonik-tools/issues/new) to see if it's possible to handle - under the hood this library uses [pgsql-ast-parser](https://npmjs.com/package/pgsql-ast-parser) and you might have found an edge case which that library doesn't handle yet.

## How it works

When you run `slonik-typegen generate`, the tool will scan your source files, and traverse their ASTs using the TypeScript compiler API. Note that typescript is a peer dependency for this reason.

On finding a sql query, it will issue a `psql` command using the flag `\gdesc`, which responds with a table of the columns and their corresponding types contained in the query. The query itself is never actually run.

The postgres type is then converted into typescript using an in-built mapping. Any slonik `typeParsers` configured (see [slonik docs](https://github.com/gajus/slonik/#api) for more info) are inspected to infer the type of the value that will be returned by the query.

To determine whether query columns are nullable, the query is parsed using [pgsql-ast-parser](https://npmjs.com/package/pgsql-ast-parser). Some more queries are sent to postgres to figure out whether query column can be null - in general, postgres is only able to guarantee if a query column is null if it comes directly from a table which declares that column non-null too.

## Recommendations

1. Check in the types to source control. They're generated code, but it makes it much easier to track what was happened when a query was update, and see those changes over time.
1. After running CI, it's worth making sure that there are no working copy changes. For git, you can use [check-clean](https://npmjs.com/package/check-clean):

```sh
npx slonik-typegen generate
npx check-clean
```
