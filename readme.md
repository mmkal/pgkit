# pgkit

<blockquote>
🚧🚧🚧🚧 NOTE 🚧🚧🚧🚧

This repo has been renamed from `slonik-tools` to `pgkit`. The two packages included in `slonik-tools` - `@slonik/migrator` and `@slonik/typegen` - are replaced by `@pgkit/migrator` and `@pgkit/typegen`.

Both are almost entriely backwards-compatible with their `@slonik/` counterparts, but some reconfiguration may be required. They also now depend on `@pgkit/client` instead of slonik. See below for more details on each packages (as well as some new ones!)

Right now, the default branch has been set to `pgkit`. You can still access slonik-tools on the `main` branch. Soon, the pgkit branch will be merged into main, the repo renamed, and the slonik-based libraries will live in a slonik-tools branch. Security updates will still be applied, and even feature requests will be considered if a need arises that isn't covered by pgkit.
</blockquote>

(almost) everything you need for working with postgres in node.js

<!-- codegen:start {preset: monorepoTOC, sort: topological, filter: '@pgkit'} -->
- [@pgkit/client](https://github.com/mmkal/pgkit/tree/pgkit/packages/client#readme) - A strongly-typed postgres client for node.js. Lets you just write SQL, safely.
- [@pgkit/typegen](https://github.com/mmkal/pgkit/tree/pgkit/packages/typegen#readme) - A library that uses [pgkit](https://npmjs.com/package/@pgkit/client) to generate typescript interfaces based on your sql queries.
- [@pgkit/schemainspect](./packages/schemainspect) - Inspects tables, views, materialized views, constraints, indexes, sequences, enums, functions, and extensions. Handles table partitioning and inheritance.
- [@pgkit/migra](https://github.com/mmkal/pgkit/tree/pgkit/packages/migra#readme) - A schema diff tool for PostgreSQL, written in TypeScript. Generates SQL scripts to migrate a database to a target state.
- [@pgkit/admin](https://github.com/mmkal/pgkit/tree/pgkit/packages/admin#readme) - A no-config admin UI for running queries against PostgreSQL database, with autocomplete for tables, columns, views, functions etc.
- [@pgkit/migrator](https://github.com/mmkal/pgkit/tree/pgkit/packages/migrator#readme) - A cli migration tool for postgres, using [pgkit](https://npmjs.com/package/@pgkit/client).
<!-- codegen:end -->

Intended to include, some day:

- A SQL formatter - [sql-formatter](https://www.npmjs.com/package/sql-formatter) and [@sqltools/formatter](https://www.npmjs.com/package/@sqltools/formatter) are good options, but produce pretty verbose statements. [prettier-plugin-sql-cst](https://github.com/nene/prettier-plugin-sql-cst) is fantastic, but requires prettier.
- A barrel package of all the above, for convenient installation
