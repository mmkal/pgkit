import {QueryClientProvider} from '@tanstack/react-query'
import {Sqler} from './Sqler'
import {withSettings} from './settings'
import {trpc, useTrpcClient} from './trpc'

function App() {
  const {queryClient, trpcClient} = useTrpcClient()
  if (!trpcClient) return null

  return (
    <trpc.Provider queryClient={queryClient} client={trpcClient}>
      <QueryClientProvider client={queryClient}>
        <Sqler />
      </QueryClientProvider>
    </trpc.Provider>
  )
}

export default withSettings(App)
