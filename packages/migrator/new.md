# @pgkit/migrator

A migration tool for postgres, using [pgkit](https://npmjs.com/package/@pgkit/client)

Features:

- SQL-first - write migrations using plain-old SQL. Just write `create table ...` statements.
- Flexible - migrations can also be written in javascript or typescript for more dynamic use-cases.
- DDL generation - read and write from a definitions file, making it easy to see what your whole schema looks like.
- Smart `create` - tinker with your database manually, then automatically create a migration file based on the drift.
- `goto`: Automatic "down" migrations. Uses [migra](https://npmjs.com/package/@pgkit/migra) to go "back" to a specific migration.
- `rebase` migrations - rewrite and squash migrations past a certain point to consolidate working changes into one.
- `check` migrations to see if your database state matches what it should be based on the list of migrations
- `repair` to update the database to match the state described by your migrations
- `baseline` - mark an existing database as up-to-date, making it easy to introduce this tool to existing projects, and avoids worry about version updates.
- Ready for distributed systems - database-level advisory locking makes it safe for multiple servers to run migrations at the same time
- Footgun-protection - any destructive changes require explicit confirmation
- Transaction support - apply all your migrations if they succeed, or none of them if any fail

## Installation

```
npm install @pgkit/migrator
```

## Usage

You can run it out of the box as a CLI:

```
npx @pgkit/migrator --help
```

```
Commands:
  sql                           Query the database. Not strictly related to migrations, but can be used for debugging. Use with caution!
  up                            Apply pending migrations
  baseline                      Baseline the database at the specified migration. This forcibly edits the migrations table to mark all migrations up to this point as executed. Useful for introducing the migrator to an existing database.
  rebase                        Rebase the migrations from the specified migration. This deletes all migration files after this point, and replaces them with a squashed migration based on the calculated diff required to reach the current database state.
  definitions.filepath          Get the path to the definitions file
  definitions.updateDb          Update the database from the definitions file
  definitions.updateFile        Update the definitions file from the database
  list                          List migrations, along with their status, file path and content
  unlock                        Release the advisory lock for this migrator on the database. This is useful if the migrator is stuck due to a previous crash
  latest                        Get the latest migration
  create                        Create a new migration file
  check                         Verify that your database is in an expected state, matching your migrations
  repair                        If your migrations are not in a valid state, this will calculate the diff required to move your database to a valid state, and apply it
  goto                          Go "back" to a specific migration. This will calculate the diff required to get to the target migration, then apply it
  wipe                          Wipe the database - remove all tables, views etc.
  ddl                           Sync the database with the definitions file

Flags:
      --full-errors        Throw unedited raw errors rather than summarising to make more human-readable.
  -h, --help               Show help
```
