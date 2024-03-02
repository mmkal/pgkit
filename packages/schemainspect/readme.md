# `schemainspect`: SQL Schema Inspection for PostgreSQL

A port of @djrobstep's [python schemainspect library](https://github.com/djrobstep/schemainspect).

Inspects tables, views, materialized views, constraints, indexes, sequences, enums, functions, and extensions. Handles table partitioning and inheritance.

**Limitations:** Function inspection only confirmed to work with SQL/PLPGSQL languages so far.

## Basic Usage

Install with npm:

```
npm install @pgkit/schemainspect
```

Get an inspection object from an already opened SQLAlchemy session or connection as follows:

```ts
import {SqlbagS, PostgreSQL} from '@pgkit/schemainspect'

const connectionString = 'postgres:postgres:postgres@localhost:5432/postgres'
const inspector = await PostgreSQL.create(new SqlbagS(connectionString))

console.log(inspector.tables)
console.log(inspector.views)
console.log(inspector.functions)

console.log(inspector.tables[`"public"."mytable"`].schema)
console.log(inspector.tables[`"public"."mytable"`].name)
console.log(inspector.tables[`"public"."mytable"`].columns.mycolumn.dbtype)
console.log(inspector.tables[`"public"."mytable"`].columns.mycolumn.is_nullable)
```

The inspection object has attributes for tables, views, and all the other things it tracks. At each of these attributes you'll find a dictionary (`Record<string, ...>`) mapping from fully-qualified-and-quoted-name-of-thing-in-database to information object.

For instance, the information about a table *books* would be accessed as follows:

    >>> books_table = i.tables['"public"."books"']
    >>> books_table.name
    'books'
    >>> books_table.schema
    'public'
    >>> [each.name for each in books_table.columns]
    ['id', 'title', 'isbn']


## Documentation

Documentation is a bit patchy at the moment. Watch this space!


## Author Credits

Initial development, maintenance:

- [djrobstep](https://github.com/djrobstep)

TypeScript port:

- [mmkal](https://github.com/mmkal)

Contributions:

- [BenSjoberg](https://github.com/BenSjoberg)
- [johto](https://github.com/johto)
