import {QueryClientProvider} from '@tanstack/react-query'
import Component from './page'
import {withSettings} from './settings'
import {trpc, useTrpcClient} from './utils/trpc'
import {Toaster} from '@/components/ui/sonner'

function App() {
  const {queryClient, trpcClient} = useTrpcClient()
  if (!trpcClient) return null

  return (
    <trpc.Provider queryClient={queryClient} client={trpcClient}>
      <QueryClientProvider client={queryClient}>
        <Component />
        <Toaster />
      </QueryClientProvider>
    </trpc.Provider>
  )
}

export default withSettings(App)
