import {MutationCache, QueryCache, QueryClient} from '@tanstack/react-query'
import {httpBatchLink} from '@trpc/client'
import {createTRPCReact} from '@trpc/react-query'
import type {inferRouterInputs, inferRouterOutputs} from '@trpc/server'
import React from 'react'
import {toast} from 'sonner'
import type {AppRouter} from '../../server/router'
import {useSettings} from '../settings'

/**
 * Memoized trpc client and react-query client - changes when settings are updated
 */
export function useTrpcClient() {
  const settings = useSettings()

  return React.useMemo(() => {
    const queryClient = new QueryClient({
      mutationCache: new MutationCache({
        onError: error => {
          const message = String(error)
          if (message.includes('confirmation_missing:')) return // handled elsewhere

          const casted = (error || {}) as {toasted?: boolean}
          if (!casted?.toasted) {
            // workaround: we wrap some mutations in a useConfirmable hook that will cause errors to bubble up twice
            toast.error(message)
            casted.toasted = true
          }
        },
      }),
      queryCache: new QueryCache({
        onError: (error, query) => {
          toast.error(
            <div>
              {String(error)}
              <pre>Query: {query.queryHash}</pre>
            </div>,
          )
        },
      }),
    })

    const trpcClient = trpc.createClient({
      links: [
        httpBatchLink({
          url: settings.apiUrl || '',
          headers: () => {
            console.log('apiUrl', settings.apiUrl, settings.headers)
            return settings.headers || {}
          },
        }),
      ],
    })

    return {queryClient, trpcClient}
  }, [settings.apiUrl, settings.headers])
}

export const trpc = createTRPCReact<AppRouter>()

export type trpc = {
  inputs: inferRouterInputs<AppRouter>
  outputs: inferRouterOutputs<AppRouter>
}
