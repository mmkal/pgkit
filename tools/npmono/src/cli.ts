import * as trpcCli from 'trpc-cli'
import {publish, PublishInput} from './publish'

const t = trpcCli.trpcServer.initTRPC.meta<trpcCli.TrpcCliMeta>().create()

const router = t.router({
  publish: t.procedure.input(PublishInput)//
  .mutation(async ({input}) => {
    return publish(input)
  }),
})

const cli = trpcCli.createCli({
  router,
  default: {procedure: 'publish'},
})

cli.run()
