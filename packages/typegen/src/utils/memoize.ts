import type {Client} from '@pgkit/client'

// @ts-expect-error types are all messed up
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {pMemoize} = require('@rebundled/p-memoize') as typeof import('@rebundled/p-memoize')

export const memoizeQueryFn = <Fn extends (client: Client, ...args: unknown[]) => Promise<unknown>>(fn: Fn) => {
  return pMemoize(fn, {
    cacheKey: ([client, ...args]) => JSON.stringify([client.connectionString(), ...args]),
  })
}
