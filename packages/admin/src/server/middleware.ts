// import {createHTTPServer} from '@trpc/server'
import {createClient} from '@pgkit/client'
import {createExpressMiddleware} from '@trpc/server/adapters/express'
import pMemoize from 'p-memoize'
import {appRouter} from './router.js'

const createClientMemoized = pMemoize(async (connectionString: string) => {
  return createClient(connectionString)
})

export const apiMiddleware = createExpressMiddleware({
  router: appRouter,
  onError: props => {
    console.error('trpc error', props.error)
  },
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
