// import {createHTTPServer} from '@trpc/server'
import {createExpressMiddleware} from '@trpc/server/adapters/express'
import {appRouter} from './router.js'
import pMemoize from 'p-memoize'
import {createClient} from '@pgkit/client'

const createClientMemoized = pMemoize(async (connectionString: string) => {
  return createClient(connectionString)
})

export const apiMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext: async ({req}) => {
    const connectionString =
      req.headers['connection-string']?.toString() ||
      process.env.PG_CONNECTION_STRING ||
      'postgres://postgres:postgres@localhost:5432/postgres'
    return {
      connection: await createClientMemoized(connectionString),
    }
  },
})
