# @slonik/migrator

A cli migration tool for postgres, using [slonik](https://npmjs.com/package/slonik).

[![Build Status](https://travis-ci.org/mmkal/slonik-tools.svg?branch=master)](https://travis-ci.org/mmkal/slonik-tools)
[![Coverage Status](https://coveralls.io/repos/github/mmkal/slonik-tools/badge.svg?branch=master)](https://coveralls.io/github/mmkal/slonik-tools?branch=master)

## Motivation

There are already plenty of migration tools out there - but if you have an existing project that uses slonik, this will be the simplest to configure. Even if you don't, the setup required is minimal.

By default, the migration scripts it runs are plain `.sql` files. No learning the quirks of an ORM, and how native postgres features map to API calls. It can also run `.js` or `.ts` files - but where possible, it's often preferable to keep it simple and stick to SQL.

This isn't technically a cli - it's a cli _helper_. Most node migration libraries are command-line utilities, which require a separate `database.json` or `config.json` file where you have to hard-code in your connection credentials. This library uses a different approach - it exposes a javascript function which you pass a slonik instance into. The javascript file you make that call in then becomes a runnable migration CLI. The migrations can be invoked programmatically from the same config.

<details>
  <summary>Contents</summary>

<!-- codegen:start {preset: markdownTOC, minDepth: 2} -->
- [Motivation](#motivation)
- [Usage](#usage)
   - [Running migrations](#running-migrations)
   - [More commands](#more-commands)
   - [Controlling migrations](#controlling-migrations)
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
const {setupSlonikMigrator} = require('@slonik/migrator')
const {createPool} = require('slonik')

// in an existing slonik project, this would usually be setup in another module
const slonik = createPool(process.env.POSTGRES_CONNECTION_STRING)

const migrator = setupSlonikMigrator({
  migrationsPath: __dirname + '/migrations',
  slonik,
  mainModule: module,
})

module.exports = {slonik, migrator}
```

By setting `mainModule: module`, `migrate.js` has now become a runnable cli script via `node migrate.js` or just `node migrate`:

```bash
node migrate create users
```
This generates placeholder migration sql scripts in the directory specified by `migrationsPath` called something like `2019-06-17T03-27.users.sql` and `down/2019-06-17T03-27.users.sql`.

You can now edit the generated sql files to `create table users(name text)` for the 'up' migration and `drop table users` for the 'down' migration.

Note: `node migrate create xyz` will try to detect the type of pre-existing migrations. The extension of the file generated will be `.sql`, `.js` or `.ts` to match the last migration found in the target directory, defaulting to `.sql` if none is found. You can override this behaviour by explicitly providing an extension, e.g. `node migrate create xyz.js`.

<details>
  <summary>JavaScript and TypeScript migrations</summary>
  
  These are expected to be modules with a required `up` export and an optional `down` export. Each of these functions will have an object passed to them with a `slonik` instance, and a `sql` tag function. You can see a [javascript](./test/migrations/2000-01-03T00-00.three.js) and a [typescript]([javascript](./test/migrations/2000-01-04T00-00.four.ts)) example in the tests.
 
  Note: if writing migrations in typescript, you will likely want to use a tool like [ts-node](https://npmjs.com/package/ts-node) to enable loading typescript modules. You can either add `require('ts-node/register/transpile-only')` at the top of your `migrate.js` file, or run `node -r ts-node/register/transpile-only migrate ...` instead of `node migrate ...`.

  (In general, using `ts-node/register/transpile-only` is preferable over `ts-node/register` - type-checking is best left to a separate process)

</details>

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

It's also possible to migrate up or down "to" a specific migration. For example, if you have run migrations `one.sql`, `two.sql`, `three.sql` and `four.sql`, you can revert `three.sql` and `four.sql` by running `node migrate down three.sql`. Note that the range is *inclusive*. To revert all migrations in one go, run `node migrate down 0`

Conversely, `node migrate up` runs all `up` migrations by default. To run only up to a certain migration, run `node migrate up two.sql`. This will run migrations `one.sql` and `two.sql` - again, the range is *inclusive* of the name.

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

parameters for the `setupSlonikMigrator` function

| property | description | default value |
|--------|------------|-------------|
| `slonik` | slonik database pool instance, created by `createPool`. | N/A |
| `migrationsPath` | path pointing to directory on filesystem where migration files will live. | N/A |
| `migrationTableName` | the name for the table migrations information will be stored in. You can change this to avoid a clash with existing tables, or to conform with your team's naming standards. | `migration` |
| `log` | how information about the migrations will be logged. You can set to `() => {}` to prevent logs appearing at all. | `console.log` |
| `mainModule` | if set to `module`, the javascript file calling `setupSlonikMigrator` can be used as a CLI script. If left undefined, the migrator can only be used programatically. | `undefined` |

## Implementation

Under the hood, the library thinly wraps [umzug](https://npmjs.com/package/umzug) with a custom slonik-based storage implementation. This isn't exposed in the API of `@slonik/migrator`, so no knowledge of umzug is required (and the dependency might even be removed in a future version).
