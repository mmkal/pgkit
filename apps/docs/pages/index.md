# pgkit

(almost) everything you need for working with postgres in node.js

pgkit is a collection of tools for working with postgres. It started as a replacement for [slonik](https://npmjs.com/package.slonik), an excellent SQL library that ships just a few too many breaking changes for some real-life use cases. Now it's a client which is API-compatible with slonik, making swapping it in easy, as well as...:

- [@pgkit/client](/packages/client) - A strongly-typed postgres client for node.js. Lets you just write SQL, safely. API-compatible with slonik.
- [@pgkit/migrator](/packages/migrator) - A smart cli migration tool.
- [@pgkit/admin](/packages/admin) - A no-config admin UI for running queries against PostgreSQL database, with autocomplete for tables, columns, views, functions etc.
- [@pgkit/typegen](/packages/typegen) - A CLI which generates typescript interfaces based on your sql queries - not just tables.
- [@pgkit/schemainspect](/packages/schemainspect) - A port of the python [schemainspect](https://github.com/djrobstep/schemainspect) library. Inspects tables, views, materialized views, constraints, indexes, sequences, enums, functions, and extensions. Handles table partitioning and inheritance.
- [@pgkit/migra](/packages/migra) - A port of the python [migra](https://github.com/djrobstep/migra) library. A schema diff tool for PostgreSQL, written in TypeScript. Generates SQL scripts to migrate a database to a target state.

At time of writing (July 2024), pgkit is a **work in progress**. You can _probably_ safely use it in production, since the underlying driver is just pg-promise, but if you don't want to be on the cutting edge of things, use it on a test project first.
