# @pgkit/admin

A zero-config admin UI for running queries against PostgreSQL database, with autocomplete for tables, columns, views, functions etc.

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

You can then configure the connection string in the UI.

## Use as a library

```ts
import express from 'express'
import {getExpressRouter} from '@pgkit/admin'

const app = express()

app.use(getExpressRouter())

app.listen(5050)
```

For lower-level control, you can import a middleware for the API, and for the client static files, or there's a [trpc](https://trpc.io) router:

```ts
import {apiMiddleware, clientMiddleware, appRouter} from '@pgkit/admin'
```

## Auth

There is no auth built in. It has been built primarily with a dev use case in mind, running against localhost. If you want to use it against a production database, you are responsible for authenticating database calls.

The simplest usage is to send a `connection-string` header, which is fine for a local db, where the value might be something like `connection-string: postgresql://postgres:postgres@localhost:5432/postgres`. However headers sent to the backend are stored in localStorage on the client. So you likely wouldn't want to use this method for production. Instead, you can perform whatever auth checks necessary in a middleware in the backend, and use trpc to create your own middleware, which doesn't get the connection string from headers.

```ts
import {createExpressMiddleware} from '@trpc/server/adapters/express'
import {appRouter, clientMiddleware} from '@pgkit/admin'
import express from 'express'

const authMiddleware = getMyAuthMiddlewareSomehow() // e.g. https://authjs.dev/reference/express

const apiMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: ({req}) => {
    const connectionString = process.env.PG_CONNECTION_STRING
    if (!connectionString) {
        throw new Error(`Missing connection string in env`)
    }
    return {connectionString}
  },
})

const app = express()

app.use(clientMiddleware)
app.use(authMiddleware)
app.use(apiMiddleware)

app.listen(7003)
```
