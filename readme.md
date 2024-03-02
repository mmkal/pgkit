# pgkit
(almost) everything you need for working with postgres in node.js

Intended to include:

- A raw SQL client
- A query-level type generator CLI
- A migrations tool
- A SQL formatter

Compatibility:

- The API is inspired by Slonik, or rather what Slonik used to be/I wish it still were. The "driver" for the client is pg-promise, which is more workable as a piece of OSS. But the query API and `sql` tag design is from Slonik. So, mostly, you can use this as a drop-in replacement for slonik. Some differences which would likely require code changes if migrating from slonik:

- Most slonik initialization options are removed. Concepts and abstractions which were invented by slonik but have perfectly good implementations in the underlying layer.

- type parsers: just use `pg.types.setTypeParser`. Some helper functions to achieve parity with slonik, and this library's recommendations are available, but they're trivial and you can just as easily implement them yourself.
- interceptors: these don't exist. There will be a `query` _middleware_, which allows wrapping the core `query` function this library calls. For the other slonik interceptors, just us `pg-promise` events.
- custom errors: this library does not catch and rethrow `pg` errors like Slonik. From a few years working with slonik, the re-thrown errors tend to make the useful information in the underlying error hard to find (not visible in Sentry, etc.). The purpose of the wrapper errors is to protect against potentially changing underlying errors, but there are dozens of breaking changes in Slonik every year.
