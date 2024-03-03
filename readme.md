# pgkit

<blockquote>
🚧🚧🚧🚧 NOTE 🚧🚧🚧🚧

This repo has been renamed from `slonik-tools` to `pgkit`. The two packages included in `slonik-tools` - `@slonik/migrator` and `@slonik/typegen` - are replaced by `@pgkit/migrator` and `@pgkit/typegen`.

Both are almost entriely backwards-compatible with their `@slonik/` counterparts, but some reconfiguration may be required. They also now depend on `@pgkit/client` instead of slonik. See below for more details on each packages (as well as some new ones!)
</blockquote>

(almost) everything you need for working with postgres in node.js

<!-- codegen:start {preset: monorepoTOC} -->
- [@pgkit/admin](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/admin#readme) - A zero-config admin UI for running queries against PostgreSQL database, with autocomplete for tables, columns, views, functions etc.
- [@pgkit/client](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/client#readme) - A strongly-typed postgres client for node.js
- [@pgkit/migra](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/migra#readme) - A port of @djrobstep's [python migra library](https://github.com/djrobstep/migra).
- [@pgkit/migrator](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/migrator#readme) - A cli migration tool for postgres, using [pgkit](https://npmjs.com/package/@pgkit/client).
- [@pgkit/schemainspect](./packages/schemainspect) - A port of @djrobstep's [python schemainspect library](https://github.com/djrobstep/schemainspect).
- [@pgkit/typegen](https://github.com/mmkal/slonik-tools/tree/pgkit/packages/typegen#readme) - A library that uses [pgkit](https://npmjs.com/package/@pgkit/client) to generate typescript interfaces based on your sql queries.
<!-- codegen:end -->

Intended to include:

- A SQL formatter
