# @pgkit/migrator

![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/mmkal)

A smart cli migration tool for postgres, using [pgkit](https://npmjs.com/package/@pgkit/client).

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

<details>
  <summary>Contents</summary>

<!-- codegen:start {preset: markdownTOC, minDepth: 2, maxDepth: 3} -->
- [Installation](#installation)
- [Usage](#usage)
   - [Principles](#principles)
- [Commands](#commands)
   - [Command: up](#command-up)
   - [Command: create](#command-create)
   - [Command: list](#command-list)
   - [Command: latest](#command-latest)
   - [Command: check](#command-check)
   - [Command: repair](#command-repair)
   - [Command: goto](#command-goto)
   - [Command: baseline](#command-baseline)
   - [Command: rebase](#command-rebase)
   - [Command: definitions.filepath](#command-definitionsfilepath)
   - [Command: definitions.updatedb](#command-definitionsupdatedb)
   - [Command: definitions.updatefile](#command-definitionsupdatefile)
   - [Command: unlock](#command-unlock)
   - [Command: wipe](#command-wipe)
   - [Command: sql](#command-sql)
- [Configuration](#configuration)
<!-- codegen:end -->

</details>

## Installation

```
npm install @pgkit/migrator
```

## Usage

You can run it out of the box as a CLI:

```
npx @pgkit/migrator --help
```

### Principles

This library aims to eliminate the tradeoff between developer experience and reliability. It's meant to be very easy to get started and write migrations, while also being as flexible as possible for almost any use-case.

With that in mind, here are some design decisions:

#### No "down" migrations

Down migrations (or ["Undo" migrations in Flyway](https://documentation.red-gate.com/fd/tutorial-undo-migrations-184127627.html)) are a nice idea, but in practice, they almost always end up being untested code that lives forever in your codebase, and almost certainly doesn't work. Instead of down migrations, @pgkit/migrator splits the use case for them into two:

1. In development, [migra](https://npmjs.com/package/@pgkit/migra) is under the hood in order to *generate diffs* between the states represented by any migrations, and apply them after user confirmation. This allows for a much more powerful `goto` feature - so you can just do `node migrate goto --name 123.yourmigration.sql`.
2. In production, you just shouldn't use `down` migrations at all. If you need to drop a table that was created by a previous migration, just create a regular migration called `drop-foo.sql`. This way, your migration files can serve as a reliable history of all the changes you made in production.

Re 2. - of course, if you _really_ want to shell into your production server and run `node migrate goto ...`, you still can. But this is not advised.

#### Be smart, be safe

@pgkit/migrator aims to go beyond a "dumb" migration tool. That is, it uses [migra](https://npmjs.com/package/@pgkit/migra) to calculate the SQL required to get to target states - but it will never _apply_ those diffs without confirming with the end-user first. One example of this is the `goto` feature above - but there's also [`check`](#command-check), [`repair`](#command-repair), [`rebase`](#command-rebase), [`wipe`](#command-wipe) and others.

When run as a CLI, the SQL that will be executed by one of these "smart" commands will be written to standard out, and wait for a "Y" to be entered into the terminal.

#### Allow overrides where appropriate

The package exposes a `Migrator` class, which has everything you need baked into it for most migration needs. But if you have a custom setup and still want to take advantage of @pgkit/migrator features, all you need to do is extend the class. Some examples

##### Customise repeatable migrations

By default, migration files ending in `.repeatable.sql` are considered repeatable. The `isRepeatable` method can be overriden to change this

```ts
import {Migrator as Base} from '@pgkit/migrator'

export class Migrator extends Base {
  isRepeatable(name: string) {
    return name.startsWith('R_')
  }
}
```

###### Use a different definitions file

The default definitions file lives in the parent folder of the migration scripts:

```ts
import {Migrator as Base} from '@pgkit/migrator'

export class Migrator extends Base {
  get definitionsFiles() {
    return `/path/to/definitions.sql`
  }
}
```

Have a look at the [API docs](./src/migrator.ts) for more methods that can be overriden.

#### Keep track of the whole database definition

Raw database migrations are a bad way for a human to understand what state the database is in. Say you're building a healthcare application. You might first create a patient table migration:

```sql
create table patient(id int, given_name text, family_name text, birth_date date);
```

Later, you might need to store the patient's gender. You'd create a new migration adding the column:

```sql
alter table patient
add column gender text;
```

Now the definition of the patient table is split across two files, and there's no one place in code to look to see what the patient table looks like. Instead of relying on an external tool with a custom UI to solve for this, you can use @pgkit/migrator's ability to sync the datbase with a `definitions.sql` file. After running each migration, you can run the [`definitions.updateFile`](#command-definitions.updateFile) command to update definitions.sql, which in the above example will result in a single statement describing the `patient` table. And it's not a custom schema definition language specific to this library. It's just SQL:

```sql
create table patient(id int, given_name text, family_name text, gender text);
```

What's more, you can *modify* this definitions file to add or remove columns at will, then use the [`definitions.updateDb`](#command-definitions.updateDb) command to update your local database based on the definitions file while developing. Once you're satisfied with the state of your database, the [`create`](#command-create) command will automatically a generate a migration file to make sure the individual migrations bring your production database to exactly the same state (the generated code should be committed and code-reviewed like any other, of course).

#### Easy to get started and to upgrade

The [`baseline`](#command-baseline) makes it easy to introduce @pgkit/migrator to an existing project. This can be used when your database is in a known-good state, as represented by the migration files. It will update the migrations table to mark all migrations up to a certain point as executed. This also serves as a reassurance the it will always be possible to upgrade to future versions, including if you need to [override behaviour yourself](#allow-overrides-where-appropriate).

#### Easy locally and in production

There's a built in CLI for local use (or production, via a shell on your production server), and there's a [tRPC](https://trpc.io) router exposed so you can deploy it to an internal admin API if you like, with any auth solution you want.

#### Use-case parity with Flyway

This one is more subjective, since there isn't a one-to-one *feature* mapping between @pgkit/migrator and Flyway. Flyway is a great tool, but it has some pretty painful requirements to run - the main one being Java. @pgkit/migrator is a pure-nodejs tool (you might have some luck running through bun or deno too). The same tool is designed to work on your local machine and in production.

Some features of Flyway are missing at time of writing, though:

1. Ant-style placeholders within `.sql` scripts. For these, you would need to use javascript migrations.
1. Java migrations! These won't be supported - but if you really want to write these, you might have some luck by extending the `Migrator` class (if you do this, please write a blog about it!)
1. Databases other than PostgreSQL.
1. Code checking - though this might be covered by other tools in the pgkit family in future.

<!-- codegen:start {preset: custom, command: up, source: ./scripts/codegen.ts, require: tsx/cjs, export: cliToMarkdown, cli: src/bin} -->
## Commands

- [`up`](#command-up) - Apply pending migrations
- [`create`](#command-create) - Create a new migration file
- [`list`](#command-list) - List migrations, along with their status, file path and content
- [`latest`](#command-latest) - Get the latest migration
- [`check`](#command-check) - Verify that your database is in an expected state, matching your migrations
- [`repair`](#command-repair) - If your migrations are not in a valid state, this will calculate the diff required to move your database to a valid state, and apply it
- [`goto`](#command-goto) - Go "back" to a specific migration. This will calculate the diff required to get to the target migration, then apply it
- [`baseline`](#command-baseline) - Baseline the database at the specified migration. This forcibly edits the migrations table to mark all migrations up to this point as executed. Useful for introducing the migrator to an existing database.
- [`rebase`](#command-rebase) - Rebase the migrations from the specified migration. This deletes all migration files after this point, and replaces them with a squashed migration based on the calculated diff required to reach the current database state.
- [`definitions.filepath`](#command-definitions.filepath) - Get the path to the definitions file
- [`definitions.updateDb`](#command-definitions.updateDb) - Update the database from the definitions file
- [`definitions.updateFile`](#command-definitions.updateFile) - Update the definitions file from the database
- [`unlock`](#command-unlock) - Release the advisory lock for this migrator on the database. This is useful if the migrator is stuck due to a previous crash
- [`wipe`](#command-wipe) - Wipe the database - remove all tables, views etc.
- [`sql`](#command-sql) - Query the database. Not strictly related to migrations, but can be used for debugging. Use with caution!

---

### Command: up

Apply pending migrations

#### Usage

- `up [flags...]`

#### Flags

- `--step <number>` - Apply this many migrations; Exclusive minimum: 0
- `--to <string>` - Only apply migrations up to this one
- `-h, --help` - Show help

---

### Command: create

Create a new migration file

#### Usage

- `create [flags...]`

#### Flags

- `--content <string>` - SQL content of the migration. If not specified, content will be generated based on the calculated diff between the existing migrations and the current database state.
- `--name <string>` - Name of the migration file. If not specified, a name will be generated based on the content of the migraiton
- `-h, --help` - Show help

---

### Command: list

List migrations, along with their status, file path and content

#### Usage

- `list [flags...]`

#### Flags

- `--output <string>` - Result properties to return; Enum: name,path,content,object (default: "object")
- `--query <string>` - Search query - migrations with names containing this string will be returned
- `--result <string>` - Which result(s) to return; Enum: first,last,one,maybeOne,all (default: "all")
- `--status <string>` - Filter by status; Enum: pending,executed
- `-h, --help` - Show help

---

### Command: latest

Get the latest migration

#### Usage

- `latest [flags...]`

#### Flags

- `--skip-check` - Skip checking that migrations are in a valid state
- `-h, --help` - Show help

---

### Command: check

Verify that your database is in an expected state, matching your migrations

#### Usage

- `check [flags...]`

#### Flags

- `-h, --help` - Show help

---

### Command: repair

If your migrations are not in a valid state, this will calculate the diff required to move your database to a valid state, and apply it

#### Usage

- `repair [flags...]`

#### Flags

- `-h, --help` - Show help

---

### Command: goto

Go "back" to a specific migration. This will calculate the diff required to get to the target migration, then apply it

#### Usage

- `goto [flags...]`

#### Flags

- `--name <string>` - Name of the migration to go to. Use "list" to see available migrations.
- `-h, --help` - Show help

---

### Command: baseline

Baseline the database at the specified migration. This forcibly edits the migrations table to mark all migrations up to this point as executed. Useful for introducing the migrator to an existing database.

#### Usage

- `baseline [flags...]`

#### Flags

- `--purge-disk` - Delete files subsequent to the specified migration (optional)
- `--to <string>` - Name of the migration to baseline to. Use `list` to see available migrations.
- `-h, --help` - Show help

---

### Command: rebase

Rebase the migrations from the specified migration. This deletes all migration files after this point, and replaces them with a squashed migration based on the calculated diff required to reach the current database state.

#### Usage

- `rebase [flags...]`

#### Flags

- `--from <string>` - Name of the migration to rebase from. This migration will remain, all subsequent ones will be replaced with a squashed migration. Use `list` to see available migrations.
- `-h, --help` - Show help

---

### Command: definitions.filepath

Get the path to the definitions file

#### Usage

- `definitions.filepath [flags...]`

#### Flags

- `-h, --help` - Show help

---

### Command: definitions.updatedb

Update the database from the definitions file

#### Usage

- `definitions.updateDb [flags...]`

#### Flags

- `-h, --help` - Show help

---

### Command: definitions.updatefile

Update the definitions file from the database

#### Usage

- `definitions.updateFile [flags...]`

#### Flags

- `-h, --help` - Show help

---

### Command: unlock

Release the advisory lock for this migrator on the database. This is useful if the migrator is stuck due to a previous crash

#### Usage

- `unlock [flags...]`

#### Flags

- `-h, --help` - Show help

---

### Command: wipe

Wipe the database - remove all tables, views etc.

#### Usage

- `wipe [flags...]`

#### Flags

- `-h, --help` - Show help

---

### Command: sql

Query the database. Not strictly related to migrations, but can be used for debugging. Use with caution!

#### Usage

- `sql [flags...]`

#### Flags

- `--doublequote <string>` - Character to use in place of " - use to avoid having to do bash quote-escaping (optional)
- `--method <string>` - Enum: any,many,one,maybeOne,query,anyFirst,oneFirst,maybeOneFirst (optional) (default: "any")
- `--query <string>`
- `--singlequote <string>` - Character to use in place of ' - use to avoid having to do bash quote-escaping (optional)
- `-h, --help` - Show help
<!-- codegen:end -->

## Configuration

Right now, the built-in CLI is configured via environment variables.

<table>
<thead>
<tr>
<th>Environment Variable</th>
<th>Description</th>
<th>Default Value</th>
</tr>
</thead>
<tbody>
<tr>
<td>PGKIT_CONNECTION_STRING</td>
<td>postgresql client connection string</td>
<td>postgresql://postgres:postgres@localhost:5432/postgres</td>
</tr>
<tr>
<td>PGKIT_MIGRATIONS_PATH</td>
<td>Path to folder containing migraitons scripts</td>
<td>${cwd}/migrations</td>
</tr>
<tr>
<td>PGKIT_MIGRATIONS_TABLE_NAME</td>
<td>Name for table to store migration history in</td>
<td>migrations</td>
</tr>
</tbody>
</table>

In future, a `pgkit.config.ts` file will (probably) be supported.
