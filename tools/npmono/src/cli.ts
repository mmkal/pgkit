import * as trpcCli from 'trpc-cli'
import {z} from 'trpc-cli'
import {releaseNotes, ReleaseNotesInput, publish, PublishInput, PrebuiltInput, publishPrebuilt} from './publish'

const t = trpcCli.trpcServer.initTRPC.meta<trpcCli.TrpcCliMeta>().create()

const router = t.router({
  publish: t.procedure
    .meta({default: true})
    .input(PublishInput) //
    .mutation(async ({input}) => {
      return publish(input)
    }),

  prebuilt: t.procedure
    .input(PrebuiltInput) //
    .mutation(async ({input}) => publishPrebuilt(input)),

  releaseNotes: t.procedure
    .input(
      ReleaseNotesInput.extend({
        acknowledgeThisDoesNotWorkYet: z.boolean(),
      }),
    ) //
    .mutation(async ({input}) => {
      return releaseNotes(input)
    }),
})

const cli = trpcCli.createCli({router})

void cli.run()
