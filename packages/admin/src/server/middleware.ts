// import {createHTTPServer} from '@trpc/server'
import {createClient, Transactable} from '@pgkit/client'
import {createExpressMiddleware} from '@trpc/server/adapters/express'
import pMemoize from 'p-memoize'
import {appRouter} from './router.js'

const createClientMemoized = pMemoize(async (connectionString: string) => {
  return createClient(connectionString)
})

export const apiMiddleware = (client?: Transactable | string) => {
  return createExpressMiddleware({
    router: appRouter,
    onError: props => {
      let error: Error = props.error
      const loggable: unknown[] = []
      while (error?.cause) {
        loggable.push(`${error.stack?.split('\n')[1]} caused by 👇`)
        error = error.cause as Error
      }
      loggable.push(error)
      console.error('trpc error', loggable)
    },
    createContext: async ({req}) => {
      if (typeof client === 'object') {
        return {connection: client}
      }

      const connectionString =
        req.headers['connection-string']?.toString() ||
        process.env.PGKIT_CONNECTION_STRING ||
        'postgres://postgres:postgres@localhost:5432/postgres'

      return {
        connection: await createClientMemoized(connectionString),
      }
    },
  })
}
