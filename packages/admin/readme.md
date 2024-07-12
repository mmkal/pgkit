# @pgkit/admin

A no-config admin UI for running queries against PostgreSQL database, with autocomplete for tables, columns, views, functions etc.

![demo](./gifs/demo.gif)

## Contents

<!-- codegen:start {preset: markdownTOC} -->
- [Contents](#contents)
- [Introduction](#introduction)
   - [Features](#features)
   - [What about pgAdmin](#what-about-pgadmin)
- [Get started](#get-started)
- [Use as a library](#use-as-a-library)
- [Deployment](#deployment)
- [Auth](#auth)
- [👽 Future](#-future)
<!-- codegen:end -->

## Introduction

### Features

- Schema-aware autocomplete:
  - tables, views, and functions from the database you're working with
  - columns from relevant tables/views/functions (e.g. with | as the cursor in `select | from mytable`, you will be suggested columns from `mytable`)
  - autocomplete fully-qualified names for tables not on the current session's `search_path`
  - suggest table-qualified columns for join statements (e.g. `select i| from profile p join settings s on s.profile_id = p.id` will suggest `s.id` and `p.id` rather than just `id`)
- results which can be copy-pasted directly into Excel or Google Sheets (using [reactgrid](https://reactgrid.com))
- Migration management using [@pgkit/migrator](https://npmjs.com/package/@pgkit/migrator)
- [schemainspect](https://npmjs.com/package/@pgkit/schemainspect) explorer of the full schema
- Simple but informative error reporting
- Multi-statement handling - each query gets a collapsible result table
- Queries stored in `localStorage` so your work is saved between sessions
- Mermaid schema visualization

### What about pgAdmin

pgAdmin is great, but when all you want is a query tool it can be a pain to configure. It (usually) requires a custom docker setup, and requires lots of laborious clicking and form-filling to create a connection to a server. It also requires login by default, even for localhost-only dev setups. Once all that's done, it still takes a fair amount of drilling-down and right clicking to just start writing a query.

It also became cleare that, after porting [schemainspect](https://npmjs.com/package/@pgkit/schemainspect), it would be possible to build a tool using fresh(er) UI components* which has more useful autocomplete.

It can also be more easily deployed as an internal admin tool against deployed databases, for existing stacks with a node.js backend (e.g. using express or similar). See the [library usage section](#use-as-a-library).

Finally, there is a lot that pgAdmin does that this library doesn't. Right now, @pgkit/admin doesn't run shell scripts, visualise query plans, have any special features around auto-vacuum, etc. (There is a a [schema-diffing tool](https://github.com/mmkal/slonik-tools/tree/HEAD/packages/migra#readme) in the pgkit family though) Having said that, there are plenty more features that can be added to this. It's open source, and it's a simple react app. Take a look at the [future](#future) section and feel free to open a pull request, or create an issue, if you have an idea of something you'd like added.

*[codemirror](https://codemirror.net) and [reactgrid](https://reactgrid.com) do the heavy UI lifting.

## Get started

You can install and run either globally or locally.

Globally:

```bash
npm install --global @pgkit/admin
pgkit-admin
```

Locally:

```bash
npm install @pgkit/admin
npx pgkit-admin
```

You can then set the `connection-string` header in the UI. When developing against a local database, this is all you'll need to do.

## Use as a library

```ts
import {getExpressRouter} from '@pgkit/admin'
import express from 'express'

const app = express()

app.use(getExpressRouter())

app.listen(5050)
```

## Deployment

If you would like to deploy the UI - for example, to an internal admin site - you can use it as a library from node.js. You can import a middleware for the API, and for the client static files, or there's a [trpc](https://trpc.io) router:

<!-- eslint-disable @typescript-eslint/no-unused-vars -->
```ts
import {appRouter, clientMiddleware} from '@pgkit/admin'
import {createClient} from '@pgkit/client'
import {createExpressMiddleware} from '@trpc/server/adapters/express'
```

## Auth

Auth isn't built in, but is easy to add using almost any auth solution for node.js. @pgkit/admin can run against a local database with no setup needed. If you want to use it against a production database, you are responsible for authenticating database calls.

The simplest usage for local development is to use the UI to set a `connection-string` header, which will be used by the local server to connect to the database. This is fine for a local db, where the value might be something you're not worried about storing in your browser's `localStorage` like `connection-string: postgresql://`. But you likely wouldn't want to (or couldn't) use this method for production. Instead, you can create a server middleware, perform whatever auth checks necessary in a middleware in the backend, and use trpc to create your own middleware, which doesn't get the connection string from headers.

```ts
import {appRouter, clientMiddleware} from '@pgkit/admin'
import {createClient} from '@pgkit/client'
import {createExpressMiddleware} from '@trpc/server/adapters/express'
import express from 'express'

const authMiddleware = getMyAuthMiddlewareSomehow() // e.g. https://authjs.dev/reference/express or https://clerk.com/docs/backend-requests/handling/nodejs

const client = createClient(process.env.PG_CONNECTION_STRING)

const apiMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: () => ({connection: client}),
})

const app = express()

app.use(clientMiddleware)
app.use(authMiddleware)
app.use(apiMiddleware)

app.listen(7003)
```

`express` is not a dependency. You can use adapters for any server framework (including a standalone node.js server) with the trpc router. See [trpc docs on adapters](https://trpc.io/docs/server/adapters) for examples of how to use with fastify, Next.js, AWS lambda, and edge runtimes.

## 👽 Future

- SQL file browsing
- Table-based database editing. Add, edit, and remove rows from tables using a Google-sheets like UI
- [Maybe] a typescript script writer. Allow writing and runnning small scripts that use [@pgkit/client](https://npmjs.com/package/@pgkit/client) that allow doing some manipulation in JavaScript.
- Auto-formatting of SQL queries
- Prepared statement support, with variables supplied separately, similar to GraphiQL
