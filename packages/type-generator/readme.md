install @slonik/typegen:

```cli
npm install @slonik/typegen
echo 'export const knownTypes = {}' > src/generated/db/index.ts
```

Then use in typescript (e.g. in a `src/db.ts` file):

```typescript
import {setupSlonikTs} from '@slonik/typegen'
import {createPool} from 'slonik'
import {knownTypes} from './generated/db'

export const {sql, interceptor} = setupSlonikTs({
  knownTypes,
  writeTypes: process.env.NODE_ENV !== 'production' && process.cwd() + '/src/generated/db',
})

export const slonik = createPool(process.env.POSTGRES_URI, {interceptors: [interceptor]})
export const getPeople = () => slonik.query(sql.Person`select * from person limit 2`)
```

When you first write this code, `getPeople` will have return type `Promise<QueryResult<any>>`.
But once you run `getPeople()` (say, by normal usage of your application), `@slonik/typegen` will inspect the field types of the query result, and generate a typescript interface for it.

Afterwards, without having to modify any code, `getPeople` will have return type `Promise<QueryResult<Person>>`, where `Person` is defined based on the query, which in this case is the schema of the `person` table. This allows you to get started fast - just write a query, and you will be able to use the results, which will be typed as `any`.

This allows you to get the type-safety of an ORM but avoid the [inner-platform effect](https://en.wikipedia.org/wiki/Inner-platform_effect). You just write regular SQL queries - you can rename columns, do any kinds of join you want, and the types generated will be based on the _query_, not the _table_, so you won't be limited by ORM feature-sets.

The code generation is opt-in. You have to provide a path for the tool to write the generated code. It is strongly recommended you don't generate code in production (the example above relies on a simple check of the `NODE_ENV` environment variable). When a falsy value is supplied to `writeTypes`, the `sql` function returned ignores the `identifier` parameter and returns slonik's `sql` template function.

### Configuration

| property | description | default value |
|--------|------------|-------------|
| `writeTypes` | location to write generated typescript. if this is undefined (or falsy) no types will be written. | `false` |
| `knownTypes` | object produced by this library's codegen. By referencing the export produced in the location set by `writeTypes`, types will gradually improve without adding any code per query. | `undefined` |
| `knownTypes.defaultType` | by setting this, you can force any unknown/new queries to be given a particular type. For example, in development, you may want a new query to be typed as `any` while you're writing code. | `undefined` |
| `typeMapper`  | custom mapper from postgres oid to typescript type, as a string. | `undefined` |
| `reset` | if true, generated code directory will be wiped and reinitialised on startup. | `false` |

### How it works

The function `setupSlonikTs` returns a special `sql` proxy object, which allows accessing any string key. When you access a key, it's considered as a query identifier. You'll get a wrapped version of slonik's `sql` tagged template variable. When you use it with a tagged template, @slonik/typegen will remember your query and store the identifier against it. `setupSlonikTs` also returns a slonik interceptor, defining a hook to be run after every query is executed. The hook looks up the query identifier from the query taht was run, and generates a typescript interface from the field metadata provided by postgres. The interface is written to disk, and added to the `KnownTypes` definition. The typescript compiler will then automatically gain type information corresponding to that query.

### Recommendations

1. You can re-use the same type name for many queries. But you should only do this if the types represented by any single name are the same or similar, since the resultant type will be a union of all of the outputs (meaning `A | B` - i.e. only fields common to both will be accessible).
1. Check in the types to source control. They're generated code, but it makes it much easier to track what was happened when a query was update, and see those changes over history.
1. After running CI, it's worth making sure that there are no working copy changes. For git, you can use [check-clean](https://npmjs.com/package/check-clean).

```sh
npm run test:integration
npx check-clean
```
