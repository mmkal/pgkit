# @pgkit/migrator

>Note: @pgkit/migrator is being re-written. Docs are _mostly_ updated.

A cli migration tool for postgres, using [pgkit](https://npmjs.com/package/@pgkit/client).

[![Node CI](https://github.com/mmkal/pgkit/workflows/CI/badge.svg)](https://github.com/mmkal/pgkit/actions?query=workflow%3ACI)
[![codecov](https://codecov.io/gh/mmkal/pgkit/branch/main/graph/badge.svg)](https://codecov.io/gh/mmkal/pgkit)

## Motivation

There are already plenty of migration tools out there - but if you have an existing project that uses pgkit, this will be the simplest to configure. Even if you don't, the setup required is minimal.

By default, the migration scripts it runs are plain `.sql` files. No learning the quirks of an ORM, and how native postgres features map to API calls. It can also run `.js` or `.ts` files - but where possible, it's often preferable to keep it simple and stick to SQL.

This isn't technically a cli - it's a cli _helper_. Most node migration libraries are command-line utilities, which require a separate `database.json` or `config.json` file where you have to hard-code in your connection credentials. This library uses a different approach - it exposes a javascript function which you pass a client instance into. The javascript file you make that call in then becomes a runnable migration CLI. The migrations can be invoked programmatically from the same config.

<details>
  <summary>Contents</summary>

<!-- codegen:start {preset: markdownTOC, minDepth: 2, maxDepth: 3} -->
- [Motivation](#motivation)
- [Installation](#installation)
- [Usage](#usage)
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
   - [Command: definitions.updateDb](#command-definitionsupdatedb)
   - [Command: definitions.updateFile](#command-definitionsupdatefile)
   - [Command: unlock](#command-unlock)
   - [Command: wipe](#command-wipe)
   - [Command: sql](#command-sql)
- [Configuration](#configuration)
<!-- codegen:end -->

</details>
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

<!-- codegen:start {preset: custom, command: up, source: ./scripts/codegen.ts, require: tsx/cjs, export: cliToMarkdown, cli: src/bin} -->
### Commands

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

### Command: definitions.updateDb

Update the database from the definitions file

#### Usage

- `definitions.updateDb [flags...]`

#### Flags

- `-h, --help` - Show help

---

### Command: definitions.updateFile

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
