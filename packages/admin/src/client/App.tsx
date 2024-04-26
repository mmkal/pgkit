import {QueryClientProvider} from '@tanstack/react-query'
import Component from './page'
import {withSettings} from './settings'
import {AutoAlertDialog, alertContext} from './utils/alert'
import {trpc, useTrpcClient} from './utils/trpc'
import {Toaster} from '@/components/ui/sonner'

function App() {
  const {queryClient, trpcClient} = useTrpcClient()
  if (!trpcClient) return null

  return (
    <trpc.Provider queryClient={queryClient} client={trpcClient}>
      <QueryClientProvider client={queryClient}>
        <alertContext.Provider>
          <Component />
          <Toaster />
          <AutoAlertDialog />
        </alertContext.Provider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

export default withSettings(App)
