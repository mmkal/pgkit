import {QueryClientProvider} from '@tanstack/react-query'
import Component from './page'
import {settingsContext} from './settings'
import {AlertProvider} from './utils/alerter'
import {trpc, useTrpcClient} from './utils/trpc'
import {Toaster} from '@/components/ui/sonner'

export default function App() {
  const {queryClient, trpcClient} = useTrpcClient()
  if (!trpcClient) return null

  return (
    <trpc.Provider queryClient={queryClient} client={trpcClient}>
      <QueryClientProvider client={queryClient}>
        <settingsContext.Provider>
          <AlertProvider>
            <Component />
            <Toaster />
          </AlertProvider>
        </settingsContext.Provider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}
