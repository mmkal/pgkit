import type {Client} from '@pgkit/client'
import {pMemoize} from '@rebundled/p-memoize'

export const memoizeQueryFn = <Fn extends (client: Client, ...args: unknown[]) => Promise<unknown>>(fn: Fn) => {
  return pMemoize(fn, {
    cacheKey: ([client, ...args]) => JSON.stringify([client.connectionString(), ...args]),
  })
}
