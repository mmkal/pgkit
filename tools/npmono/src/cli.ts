import * as trpcCli from 'trpc-cli'
import {publish} from './publish'

const t = trpcCli.trpcServer.initTRPC.meta<trpcCli.TrpcCliMeta>().create()

const router = t.router({
  publish: t.procedure.mutation(async () => {
    return publish()
  }),
})

const cli = trpcCli.createCli({
  router,
  default: {procedure: 'publish'},
})

cli.run()
