import * as trpcCli from 'trpc-cli'
import {releaseNotes, ReleaseNotesInput, publish, PublishInput} from './publish'

const t = trpcCli.trpcServer.initTRPC.meta<trpcCli.TrpcCliMeta>().create()

const router = t.router({
  publish: t.procedure
    .input(PublishInput) //
    .mutation(async ({input}) => {
      return publish(input)
    }),

  ...(process.env.TEST_RELEASE_NOTES && {
    releaseNotes: t.procedure
      .input(ReleaseNotesInput) //
      .mutation(async ({input}) => {
        return releaseNotes(input)
      }),
  }),
})

const cli = trpcCli.createCli({
  router,
  default: {procedure: 'publish'},
})

void cli.run()
