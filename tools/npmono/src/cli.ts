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
        includePeerDependencies: z
          .boolean()
          .describe(
            "Converts peer dependencies to production dependencies. Don't use unless you are sure you need this",
          )
          .default(false),
      }),
    )
    .mutation(async ({input: options}) => {
      const dateVersion =
        new Date().toISOString().split('T')[0].split('-').join('.').replaceAll('.0', '.') + -Date.now()
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

        const deps = {
          ...packageJson.dependencies,
          ...(options.includePeerDependencies && packageJson.peerDependencies),
        }
        for (const dep of Object.keys(deps)) {
          const foundDep = ctx.packages.find(p => p.name === dep)
          if (foundDep) {
            deps[dep] = `file:${path.join(foundDep.folder, 'right/package')}`
            packageJson.dependencies = deps
          }
        }
        if (packageJson.dependencies === deps) {
          // we updated the dependencies, so we need to write the file
          fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
        }
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
