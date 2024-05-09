import {MutationCache, QueryCache, QueryClient} from '@tanstack/react-query'
import {httpBatchLink} from '@trpc/client'
import {createTRPCReact} from '@trpc/react-query'
import type {inferRouterInputs, inferRouterOutputs} from '@trpc/server'
import React, {useState} from 'react'
import {toast} from 'sonner'
import type {AppRouter} from '../../server/router'
import {useSettings} from '../settings'

export function useTrpcClient() {
  const settings = useSettings()
  React.useEffect(() => {
    setTrpcClient(
      trpc.createClient({
        links: [
          httpBatchLink({
            url: settings.apiUrl || '',
            headers: () => {
              console.log('apiUrl', settings.apiUrl, settings.headers)
              return settings.headers || {}
            },
          }),
        ],
      }),
    )
  }, [settings.apiUrl, settings.headers])
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: error => {
            toast.error(String(error))
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
      }),
  )
  const [trpcClient, setTrpcClient] = useState<ReturnType<typeof trpc.createClient>>()

  return {queryClient, trpcClient}
}

export const trpc = createTRPCReact<AppRouter>()

export type trpc = {
  inputs: inferRouterInputs<AppRouter>
  outputs: inferRouterOutputs<AppRouter>
}
