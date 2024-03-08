# pgkit

<blockquote>
🚧🚧🚧🚧 NOTE 🚧🚧🚧🚧

This repo is soon to be renamed from `slonik-tools` to `pgkit`. The two packages included in `slonik-tools` - `@slonik/migrator` and `@slonik/typegen` - are replaced by `@pgkit/migrator` and `@pgkit/typegen`.

Both are almost entriely backwards-compatible with their `@slonik/` counterparts, but some reconfiguration may be required. They also now depend on `@pgkit/client` instead of slonik. See below for more details on each packages (as well as some new ones!)

Right now, the default branch has been set to `pgkit`. You can still access slonik-tools on the `main` branch. Soon, the pgkit branch will be merged into main, the repo renamed, and the slonik-based libraries will live in a slonik-tools branch. Security updates will still be applied, and even feature requests will be considered if a need arises that isn't covered by pgkit.
</blockquote>

(almost) everything you need for working with postgres in node.js

<!-- codegen:start {preset: monorepoTOC} -->
- [@pgkit/admin](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/admin#readme) - A no-config admin UI for running queries against PostgreSQL database, with autocomplete for tables, columns, views, functions etc.
- [@pgkit/client](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/client#readme) - A strongly-typed postgres client for node.js. Lets you just write SQL, safely.
- [@pgkit/migra](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/migra#readme) - A schema diff tool for PostgreSQL, written in TypeScript. Generates SQL scripts to migrate a database to a target state.
- [@pgkit/migrator](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/migrator#readme) - A cli migration tool for postgres, using [pgkit](https://npmjs.com/package/@pgkit/client).
- [@pgkit/schemainspect](./packages/schemainspect) - Inspects tables, views, materialized views, constraints, indexes, sequences, enums, functions, and extensions. Handles table partitioning and inheritance.
- [@pgkit/typegen](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/typegen#readme) - A library that uses [pgkit](https://npmjs.com/package/@pgkit/client) to generate typescript interfaces based on your sql queries.
- [pgkit](./packages/pgkit) - Monopackage for the [pgkit](https://github.com/mmkal/slonik-tools) family.
<!-- codegen:end -->

Intended to include:

- A SQL formatter
