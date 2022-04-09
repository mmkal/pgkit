# @slonik/migrator

A cli migration tool for postgres, using [slonik](https://npmjs.com/package/slonik).

[![Node CI](https://github.com/mmkal/slonik-tools/workflows/CI/badge.svg)](https://github.com/mmkal/slonik-tools/actions?query=workflow%3ACI)
[![codecov](https://codecov.io/gh/mmkal/slonik-tools/branch/master/graph/badge.svg)](https://codecov.io/gh/mmkal/slonik-tools)

## Motivation

There are already plenty of migration tools out there - but if you have an existing project that uses slonik, this will be the simplest to configure. Even if you don't, the setup required is minimal.

By default, the migration scripts it runs are plain `.sql` files. No learning the quirks of an ORM, and how native postgres features map to API calls. It can also run `.js` or `.ts` files - but where possible, it's often preferable to keep it simple and stick to SQL.

This isn't technically a cli - it's a cli _helper_. Most node migration libraries are command-line utilities, which require a separate `database.json` or `config.json` file where you have to hard-code in your connection credentials. This library uses a different approach - it exposes a javascript function which you pass a slonik instance into. The javascript file you make that call in then becomes a runnable migration CLI. The migrations can be invoked programmatically from the same config.

<details>
  <summary>Contents</summary>

<!-- codegen:start {preset: markdownTOC, minDepth: 2} -->
- [Motivation](#motivation)
- [Usage](#usage)
   - [JavaScript and TypeScript migrations](#javascript-and-typescript-migrations)
   - [Running migrations](#running-migrations)
   - [More commands](#more-commands)
   - [Controlling migrations](#controlling-migrations)
- [Commands](#commands)
   - [up](#up)
   - [down](#down)
   - [pending](#pending)
   - [executed](#executed)
   - [create](#create)
   - [repair](#repair)
   - [Examples](#examples)
   - [Running programatically](#running-programatically)
- [Configuration](#configuration)
- [Implementation](#implementation)
<!-- codegen:end -->

</details>

## Usage

```bash
npm install --save-dev @slonik/migrator
```

Then in a file called `migrate.js`:
```javascript
const {SlonikMigrator} = require('@slonik/migrator')
const {createPool} = require('slonik')

// in an existing slonik project, this would usually be setup in another module
const slonik = createPool(process.env.POSTGRES_CONNECTION_STRING) // e.g. 'postgresql://postgres:postgres@localhost:5433/postgres'

const migrator = new SlonikMigrator({
  migrationsPath: __dirname + '/migrations',
  migrationTableName: 'migration',
  slonik,
})

migrator.runAsCLI()
```

By calling `runAsCLI()`, `migrate.js` has now become a runnable cli script via `node migrate.js` or just `node migrate`:

```bash
node migrate create --name users.sql
```
This generates placeholder migration sql scripts in the directory specified by `migrationsPath` called something like `2019-06-17T03-27.users.sql` and `down/2019-06-17T03-27.users.sql`.

You can now edit the generated sql files to `create table users(name text)` for the 'up' migration and `drop table users` for the 'down' migration.

### JavaScript and TypeScript migrations
  
These are expected to be modules with a required `up` export and an optional `down` export. Each of these functions will have an object passed to them with a `slonik` instance, and a `sql` tag function. You can see a [javascript](./test/generated/run/migrations/03.three.js) and a [typescript](./test/generated/run/migrations/04.four.ts) example in the tests.
 
Note: if writing migrations in typescript, you will likely want to use a tool like [ts-node](https://npmjs.com/package/ts-node) to enable loading typescript modules. You can either add `require('ts-node/register/transpile-only')` at the top of your `migrate.js` file, or run `node -r ts-node/register/transpile-only migrate ...` instead of `node migrate ...`.

(Using `ts-node/register/transpile-only` performs faster than `ts-node/register`, and is safe to use if type-checking is performed separately).

**Recommendation**: where possible, it's better to use SQL migrations than JavaScript or TypeScript. They're more portable and less likely to have side-effects beyond the DB.

### Running migrations

To run all "up" migrations:

```bash
node migrate up
```

The `users` table will now have been created.

To revert the last migration:

```bash
node migrate down
```

The `users` table will now have been dropped again.

### More commands

To print the list of migrations that have already been applied:

```bash
node migrate executed
```

To print the list of migrations that are due to be applied:

```bash
node migrate pending
```

### Controlling migrations

By default, `node migrate down` reverts only the most recent migration.

It is also possible to migrate up or down "to" a specific migration. For example, if you have run migrations `one.sql`, `two.sql`, `three.sql` and `four.sql`, you can revert `three.sql` and `four.sql` by running `node migrate down --to three.sql`. Note that the range is *inclusive*. To revert all migrations in one go, run `node migrate down --to 0`. Note also that the migration names will usually contain a timestamp prefix, and can be listed with `node migrate pending` or `node migrate executed`.

Conversely, `node migrate up` runs all `up` migrations by default. To run only up to a certain migaton, run `node migrate up --to two.sql`. This will run migrations `one.sql` and `two.sql` - again, the range is *inclusive* of the name.

See [commands](#commands) for more options, and [examples](#examples) to see how you can use the CLI.

<!-- generate umzug's CLI section, since this package just exposes an umzug helper -->
<!-- codegen:start {preset: custom, source: ./codegen.js} -->
## Commands

```
usage: node migrate [-h] <command> ...

@slonik/migrator - PostgreSQL migration tool

Positional arguments:
  <command>
    up        Applies pending migrations
    down      Revert migrations
    pending   Lists pending migrations
    executed  Lists executed migrations
    create    Create a migration file
    repair    Repair hashes in the migration table

Optional arguments:
  -h, --help  Show this help message and exit.

For detailed help about a specific command, use: node migrate <command> -h
```

### up

```
usage: node migrate up [-h] [--to NAME] [--step COUNT] [--name MIGRATION]
                   [--rerun {THROW,SKIP,ALLOW}]
                   

Performs all migrations. See --help for more options

Optional arguments:
  -h, --help            Show this help message and exit.
  --to NAME             All migrations up to and including this one should be 
                        applied.
  --step COUNT          Run this many migrations. If not specified, all will 
                        be applied.
  --name MIGRATION      Explicity declare migration name(s) to be applied.
  --rerun {THROW,SKIP,ALLOW}
                        Specify what action should be taken when a migration 
                        that has already been applied is passed to --name. 
                        The default value is "THROW".
```

### down

```
usage: node migrate down [-h] [--to NAME] [--step COUNT] [--name MIGRATION]
                     [--rerun {THROW,SKIP,ALLOW}]
                     

Undoes previously-applied migrations. By default, undoes the most recent 
migration only. Use --help for more options. Useful in development to start 
from a clean slate. Use with care in production!

Optional arguments:
  -h, --help            Show this help message and exit.
  --to NAME             All migrations up to and including this one should be 
                        reverted. Pass "0" to revert all.
  --step COUNT          Run this many migrations. If not specified, one will 
                        be reverted.
  --name MIGRATION      Explicity declare migration name(s) to be reverted.
  --rerun {THROW,SKIP,ALLOW}
                        Specify what action should be taken when a migration 
                        that has already been reverted is passed to --name. 
                        The default value is "THROW".
```

### pending

```
usage: node migrate pending [-h] [--json]

Prints migrations returned by `umzug.pending()`. By default, prints migration 
names one per line.

Optional arguments:
  -h, --help  Show this help message and exit.
  --json      Print pending migrations in a json format including names and 
              paths. This allows piping output to tools like jq. Without this 
              flag, the migration names will be printed one per line.
```

### executed

```
usage: node migrate executed [-h] [--json]

Prints migrations returned by `umzug.executed()`. By default, prints 
migration names one per line.

Optional arguments:
  -h, --help  Show this help message and exit.
  --json      Print executed migrations in a json format including names and 
              paths. This allows piping output to tools like jq. Without this 
              flag, the migration names will be printed one per line.
```

### create

```
usage: node migrate create [-h] --name NAME [--prefix {TIMESTAMP,DATE,NONE}]
                       [--folder PATH] [--allow-extension EXTENSION]
                       [--skip-verify] [--allow-confusing-ordering]
                       

Generates a placeholder migration file using a timestamp as a prefix. By 
default, mimics the last existing migration, or guesses where to generate the 
file if no migration exists yet.

Optional arguments:
  -h, --help            Show this help message and exit.
  --name NAME           The name of the migration file. e.g. my-migration.js, 
                        my-migration.ts or my-migration.sql. Note - a prefix 
                        will be added to this name, usually based on a 
                        timestamp. See --prefix
  --prefix {TIMESTAMP,DATE,NONE}
                        The prefix format for generated files. TIMESTAMP uses 
                        a second-resolution timestamp, DATE uses a 
                        day-resolution timestamp, and NONE removes the prefix 
                        completely. The default value is "TIMESTAMP".
  --folder PATH         Path on the filesystem where the file should be 
                        created. The new migration will be created as a 
                        sibling of the last existing one if this is omitted.
  --allow-extension EXTENSION
                        Allowable extension for created files. By default .js,
                         .ts and .sql files can be created. To create txt 
                        file migrations, for example, you could use '--name 
                        my-migration.txt --allow-extension .txt' This 
                        parameter may alternatively be specified via the 
                        UMZUG_ALLOW_EXTENSION environment variable.
  --skip-verify         By default, the generated file will be checked after 
                        creation to make sure it is detected as a pending 
                        migration. This catches problems like creation in the 
                        wrong folder, or invalid naming conventions. This 
                        flag bypasses that verification step.
  --allow-confusing-ordering
                        By default, an error will be thrown if you try to 
                        create a migration that will run before a migration 
                        that already exists. This catches errors which can 
                        cause problems if you change file naming conventions. 
                        If you use a custom ordering system, you can disable 
                        this behavior, but it's strongly recommended that you 
                        don't! If you're unsure, just ignore this option.
```

### repair

```
usage: node migrate repair [-h] [-d]

If, for any reason, the hashes are incorrectly stored in the database, you 
can recompute them using this command. Note that due to a bug in 
@slonik/migrator v0.8.X-v0.9-X the hashes were incorrectly calculated, so 
this command is recommended after upgrading to v0.10.

Optional arguments:
  -h, --help     Show this help message and exit.
  -d, --dry-run  No changes are actually made
```
<!-- codegen:end -->

### Examples

Assuming `migrate.js` is a script setup something like:

```js
const {SlonikMigrator} = require('@slonik/migrator')

const migrator = new SlonikMigrator(...)
migrator.runAsCLI()
```

Here are some ways you could use it:

```bash
ndoe migrate --help # shows help

node migrate up # runs all pending migrations

node migrate down # reverts the last-run migration

node migrate down --to 0 # reverts all migrations
node migrate up --to some-specific-migration.sql # runs all migrations up to and including some-specific-migration.sql
node migrate down --to some-other-migration.sql # reverts all migrations down to and including some-other-migration.sql

node migrate up --step 2 # runs the next two migrations
node migrate down --step 2 # reverts the two most recent migrations

node migrate up --name m1.sql --name m2.sql # runs only m1.sql and m2.sql. Throws if they aren't pending.
node migrate up --name m1.sql --name m2.sql --rerun ALLOW # runs m1.sql and m2.sql, even if they've already been executed
node migrate up --name m1.sql --name m2.sql --rerun SKIP # runs m1.sql and m2.sql, if they haven't already been executed. Skips if they have.

node migrate down --name m1.sql --name m2.sql # reverts only m1.sql and m2.sql. Throws if they haven't been executed.
node migrate down --name m1.sql --name m2.sql --rerun ALLOW # runs m1.sql and m2.sql, even if they haven't been executed yet.
node migrate down --name m1.sql --name m2.sql --rerun SKIP # runs m1.sql and m2.sql, if they have already been executed. Skips if they haven't.

node migrate up --help # shows help for `up`
node migrate down --help # shows help for `down`

node migrate create --name some-migration.sql # creates a new migration, prefixed with timestamp, in the migrations folder

node migrate pending # lists pending migrations
node migrate executed # lists executed migrations

node migrate repair --dry-run # logs which migrations are in need of a repair
node migrate repair # repairs them
```

### Running programatically

To run migrations programmatically, you can import the `migrator` object from another file. For example, in a lambda handler:

```javascript
module.exports.handler = () => require('./migrate').up()
```

Or, you could write a script which seeds data in test environments:

```javascript
import {migrator, slonik} from './migrate'
import {sql} from 'slonik'

export const seed = async () => {
  const migrations = await migrator.up()
  if (migrations.some(m => m.file.endsWith('.users.sql'))) {
    await slonik.query(sql`insert into users(name) values('foo')`)
  }
}
```

## Configuration

parameters for the `SlonikMigrator` constructor

| property | description | default value |
|--------|------------|-------------|
| `slonik` | slonik database pool instance, created by `createPool`. | N/A |
| `migrationsPath` | path pointing to directory on filesystem where migration files will live. | N/A |
| `migrationTableName` | the name for the table migrations information will be stored in. You can change this to avoid a clash with existing tables, or to conform with your team's naming standards. Set to an array to change the schema e.g. `['public', 'dbmigrations']` | N/A |
| `logger` | how information about the migrations will be logged. You can set to `undefined` to prevent logs appearing at all. | `console` |

## Implementation

Under the hood, the library thinly wraps [umzug](https://npmjs.com/package/umzug) with a custom slonik-based stoage implementation.
