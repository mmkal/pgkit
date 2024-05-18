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
