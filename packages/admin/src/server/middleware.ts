// import {createHTTPServer} from '@trpc/server'
import {createExpressMiddleware} from '@trpc/server/adapters/express'
import {appRouter} from './router.js'

export const apiMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: ({req}) => {
    return {
      connectionString:
        req.headers['connection-string']?.toString() ||
        process.env.PG_CONNECTION_STRING ||
        'postgres://postgres:postgres@localhost:5432/postgres',
    }
  },
})
