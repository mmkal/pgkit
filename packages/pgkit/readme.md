# pgkit

[![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/mmkal)](https://x.com/mmkalmmkal)

Monopackage for the [pgkit](https://github.com/mmkal/pgkit) family.

Bundled package of:

- [@pgkit/client](https://npmjs.com/package/@pgkit/client) (`import {createClient} from 'pgkit/client'`)
- [@pgkit/migrator](https://npmjs.com/package/@pgkit/migrator) (`import {Migrator} from 'pgkit/migrator'`)
- `pgkit/config`, which allows defining a type-safe config for projects using pgkit.
- A CLI with commands for (run `pgkit --help` for full docs):
   - `pgkit query`: running queries directly against the database (e.g. `pgkit query 'select now()'` or `pgkit q 'select now()'`)
   - `pgkit migrate`: migrating the database (see [@pgkit/migrator](https://npmjs.com/package/@pgkit/migrator) for docs)
   - `pgkit generate`: generating typescript definitions for queries in code (see [@pgkit/typegen](https://npmjs.com/package/@pgkit/typegen))
   - `pgkit admin`: run a server for a web UI for interacting with your database (see [@pgkit/admin](https://npmjs.com/package/@pgkit/admin)) (note: requires `@pgkit/admin` as a peer dependency)

Soon more libraries (schemainspect, migra, admin) will be bundled in. For now use the individual packages. Docs here: https://pgkit.dev.
