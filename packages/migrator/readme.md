# @slonik/migrator

[![Build Status](https://travis-ci.org/mmkal/slonik-tools.svg?branch=master)](https://travis-ci.org/mmkal/slonik-tools)
[![Coverage Status](https://coveralls.io/repos/github/mmkal/slonik-tools/badge.svg?branch=master)](https://coveralls.io/github/mmkal/slonik-tools?branch=master)

A cli migration helper tool using [slonik](https://npmjs.com/package/slonik).

## Motivation

There are already plenty of migration tools out there - but if you have an existing project that uses slonik, this will be by far the simplest to configure. Even if you don't, the setup required is minimal.

This isn't a cli tool - it's a cli tool _helper_. Most node migration libraries are command-line utilities, which require a separate `database.json` or `config.json` file where you have to hard-code in your connection credentials. This library uses a different approach - it exposes a javascript function which you pass a slonik instance into. The javascript file you make that call in then becomes a runnable migration script.

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

```bash
node migrate up
```

The `users` table will now have been created.

```bash
node migrate down
```

The `users` table will now have been dropped again.

To run migrations programmatically, you can import the `migrator` object, say in a `seed.js`.

```javascript
import {migrator, slonik} from './migrate'
import {sql} from 'slonik'

export const foo = async () => {
  await migrator.up()
  await slonik.query(sql`insert into users(name) values('foo')`)
}
```

## Configuration

parameters for the `setupSlonikMigrator` function

| property | description | default value |
|--------|------------|-------------|
| `slonik` | slonik database pool instance, created by `createPool`. | N/A |
| `migrationsPath` | path pointing to directory on filesystem where migration files will live. | N/A |
| `migrationsTableName` | the name for the table migrations information will be stored in. You can change this to avoid a clash with existing tables, or to conform with your team's naming standards. | `migration` |
| `log` | how information about the migrations will be logged. You can set to `() => {}` to prevent logs appearing at all. | `console.log` |
| `mainModule` | if set to `module`, the javascript file calling `setupSlonikMigrator` can be used as a CLI script. If left undefined, the migrator can be used programatically. | `undefined` |

## Implementation

Under the hood, the library thinly wraps [umzug](https://npmjs.com/package/umzug) with a custom custom slonik-based storage implementation. This isn't exposed in the API of `@slonik/migrator`, so no knowledge of umzug is required (and the dependency might even be removed in a future version).
