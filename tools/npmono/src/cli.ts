import * as fs from 'fs'
import * as path from 'path'
import * as trpcCli from 'trpc-cli'
import {z} from 'trpc-cli'
import {releaseNotes, ReleaseNotesInput, publish, PublishInput, PrebuiltInput, publishPrebuilt, Ctx} from './publish'

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

  local: t.procedure
    .meta({
      description:
        'Preps packages for local installation. Builds and packs all packages, and replaces dependencies with local versions using the file protocol. Prints install commands to stdout.',
    })
    .input(
      z.object({
        prebuilt: z
          .string()
          .describe(
            'path to prebuilt folder. if ommitted a dry-run publish will be done to build and pack packages into a temp folder.\nNOTE: if you provide this value, dependencies in this folder will be replaced with local versions using the file protocol.',
          )
          .optional(),
      }),
    )
    .mutation(async ({input: options}) => {
      const date = new Date(Number(options.prebuilt?.match(/\b\d{13}$/)?.[0] || Date.now()))
      const dateVersion =
        date.toISOString().split('T')[0].split('-').join('.').replaceAll('.0', '.') + String(-date.getTime())
      const ctx = options.prebuilt
        ? Ctx.parse(JSON.parse(fs.readFileSync(options.prebuilt + '/context.json').toString()))
        : await publish({
            version: dateVersion,
            publish: false,
            skipRegistryPull: true,
          })

      for (const pkg of ctx.packages) {
        const packagePath = path.join(pkg.folder, 'right/package')
        const packageJsonPath = path.join(packagePath, 'package.json')
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString()) as import('type-fest').PackageJson

        packageJson.version = dateVersion

        const warning = `ONLY INTENDED FOR LOCAL INSTALLATION VIA 'file:' PROTOCOL. DO NOT PUBLISH!`
        packageJson.description = [warning, packageJson.description].filter(Boolean).join('\n\n')

        for (const dep of Object.keys(packageJson.dependencies || {})) {
          const foundDep = ctx.packages.find(p => p.name === dep)
          if (foundDep) {
            packageJson.dependencies![dep] = `file:${path.join(foundDep.folder, 'right/package')}`
          }
        }
        for (const peerDep of Object.keys(packageJson.peerDependencies || {})) {
          const foundPeerDep = ctx.packages.find(p => p.name === peerDep)
          if (foundPeerDep) {
            packageJson.peerDependencies![foundPeerDep.name] = dateVersion
          }
        }
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
      }

      for (const pkg of ctx.packages) {
        const packagePath = path.join(pkg.folder, 'right/package')
        const packageManager = process.env.npm_config_user_agent?.split(/\W/)[0] || 'npm'
        // eslint-disable-next-line no-console
        console.log(`${packageManager} add file:${packagePath}`)
      }
    }),
})

const cli = trpcCli.createCli({router})

void cli.run()
