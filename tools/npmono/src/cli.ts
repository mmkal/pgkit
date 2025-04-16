import {execa} from '@rebundled/execa'
import {readdir} from 'fs/promises'
import * as path from 'path'
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

  prepLink: t.procedure
    .meta({
      description:
        'preps package(s) for local linking. useful if you want to try out your packages in another project. prints a link command to stdout',
    })
    .input(
      z.object({
        prebuilt: z.string().describe('prebuilt folder').optional(),
        package: z.string().describe('package name to link. if ommitted all packages will printed').optional(),
        install: z.string().default('npm install --include prod'),
      }),
    )
    .mutation(async ({input: options}) => {
      if (!options.prebuilt) {
        const dateVersion =
          new Date().toISOString().split('T')[0].split('-').join('.').replaceAll('.0', '.') + -Date.now()
        const ctx = await publish({
          version: dateVersion,
          publish: false,
        })
        options.prebuilt = ctx.tempDir
      }

      await execa('sh', ['-c', options.install])
      console.log(`run the following to link package(s) locally:`)

      const names = await readdir(options.prebuilt)
      for (const name of names.filter(n => !options.package || n.replace(/^\d+\./, '') === options.package)) {
        console.log(`npx link ${path.join(options.prebuilt, name, 'right/package')}`)
      }
    }),
})

const cli = trpcCli.createCli({router})

void cli.run()
