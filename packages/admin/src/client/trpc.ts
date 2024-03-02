import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {httpBatchLink} from '@trpc/client'
import {createTRPCReact} from '@trpc/react-query'
import React, {useState} from 'react'
import type {AppRouter} from '../server/router'
import {useSettings} from './settings'

export function useTrpcClient() {
  const settings = useSettings()
  React.useEffect(() => {
    setTrpcClient(
      trpc.createClient({
        links: [
          httpBatchLink({
            url: settings.apiUrl,
            headers: () => settings.headers,
          }),
        ],
      }),
    )
  }, [settings.apiUrl, settings.headers])
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient, setTrpcClient] = useState<ReturnType<typeof trpc.createClient>>()

  return {queryClient, trpcClient}
}

export const trpc = createTRPCReact<AppRouter>()
