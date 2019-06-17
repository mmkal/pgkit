# @slonik/migrator

A cli migration helper tool using [slonik](https://npmjs.com/package/slonik).

## Motivation

There are already plenty of migration tools out there - but if you have an existing project that uses slonik, this will be by far the simplest to configure. Even if you don't, the setup will is minimal.

## Usage

```bash
npm install --save-dev @slonik/migrator
```

Then in a `migrate.js` or `migrate.ts` script:
```javascript
import {setupSlonikMigrator} from '@slonik/migrator'
import {createPool} from 'slonik'

// in an existing slonik project, this would usually be setup in another module
export const slonik = createPool(process.env.POSTGRES_CONNECTION_STRING)

export const migrator = setupSlonikMigrator({
  migrationsPath: __dirname + '/migrations',
  slonik,
  mainModule: module,
})
```

By setting `mainModule: module`, `migrate.js` has now become a runnable cli script via `node migrate.js` or just `node migrate`:

```bash
node migrate create users # creates placeholder up and down sql migration scripts
```

Then edit the generated sql files to `create table users(name text)` for the 'up' migration and `drop table users` for the 'down' migration.

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
  await slonik.query(sql`insert into users`)
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
