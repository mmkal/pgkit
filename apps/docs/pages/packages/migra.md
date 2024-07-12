# migra: Like diff but for Postgres schemas


A schema diff tool for PostgreSQL, written in TypeScript. Generates SQL scripts to migrate a database to a target state.

A port of @djrobstep's [python migra library](https://github.com/djrobstep/migra).

- ## compare schemas
- ## autogenerate migration scripts
- ## autosync your development database from your application models
- ## make your schema changes testable, robust, and (mostly) automatic

Use it in your nodejs scripts, or from the command line like this:

```
npm install --global @pgkit/migra
```

    $ migra postgresql:///a postgresql:///b
    alter table "public"."products" add column newcolumn text;

    alter table "public"."products" add constraint "x" CHECK ((price > (0)::numeric));

`migra` magically figures out all the statements required to get from A to B.

Most features of PostgreSQL are supported.

**Migra supports PostgreSQL >= 9 only.** Known issues exist with earlier versions. More recent versions are more comprehensively tested. Development resources are limited, and feature support rather than backwards compatibility is prioritised.

## THE DOCS

Documentation for the original library is at [databaseci.com/docs/migra](https://web.archive.org/web/20220309093235/https://databaseci.com/docs/migra) (on archive.org because the original site, databaseci.com, is down at time of writing).

A port of the documentation site is a TODO for this library.

## Folks, schemas are good

Schema migrations are without doubt the most cumbersome and annoying part of working with SQL databases. So much so that some people think that schemas themselves are bad!

But schemas are actually good. Enforcing data consistency and structure is a good thing. It’s the migration tooling that is bad, because it’s harder to use than it should be. ``migra`` is an attempt to change that, and make migrations easy, safe, and reliable instead of something to dread.

## Contributing

There's no strategy set in stone right now for how this library can evolve beyond being a port of the Python original, which appears to be unmaintained. Check the issues of this repo, or for the original, it's https://github.com/djrobstep/migra/issues.

## Credits for original library

- [djrobstep](https://github.com/djrobstep): initial development, maintenance
- [alvarogzp](https://github.com/alvarogzp): privileges support
- [seblucas](https://github.com/seblucas): docker improvements
- [MOZGIII](https://github.com/MOZGIII): docker support
- [mshahbazi](https://github.com/mshahbazi): misc fixes and enhancements
