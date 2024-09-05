import {existsSync} from 'fs'
import {trpcServer, z, TrpcCliMeta} from 'trpc-cli'
import * as defaults from './defaults'
import {generate, Options} from './generate'

const trpc = trpcServer.initTRPC.meta<TrpcCliMeta>().create()

const Options = z.object({
  config: z
    .string()
    .describe(
      'Path to a module containing parameters to be passed to generate. Note: any options passed on the command line will override those in the config file.',
    )
    .default(defaults.typegenConfigFile),
  rootDir: z.string().describe('Path to the source directory containing SQL queries.').default(defaults.defaultRootDir),
  connectionString: z
    .string()
    .describe('URL for connecting to postgres.') //
    .default(defaults.defaultConnectionURI),
  psql: z
    .string()
    .describe(
      'psql command used to query postgres via CLI client. If using docker, you may want to use `docker-compose exec -T postgres psql`',
    )
    .default(defaults.defaultPsqlCommand),
  defaultType: z
    .string()
    .describe('TypeScript fallback type for when no type is found.')
    .default(defaults.defaultTypeScriptType),
  include: z
    .array(z.string())
    .describe('Glob pattern of files to search for SQL queries in.')
    .default(defaults.defaultIncludePatterns),
  exclude: z
    .array(z.string())
    .describe('Glob pattern for files to be excluded from processing.')
    .default(defaults.defaultExcludePatterns),
  since: z
    .string()
    .optional()
    .describe('Limit affected files to those which have been changed since the given git ref.'),
  migrate: z
    .enum(['<=0.8.0'])
    .optional()
    .describe('Before generating types, attempt to migrate a codebase which has used a prior version of this tool.'),
  skipCheckClean: z
    .boolean()
    .optional()
    .describe('If enabled, the tool will not check the git status to ensure changes are checked in.'),
  watch: z
    .boolean()
    .optional()
    .describe(
      'Run the type checker in watch mode. Files will be run through the code generator when changed or added.',
    ),
  lazy: z.boolean().optional().describe('Skip initial processing of input files. Only useful with --watch.'),
} satisfies {
  [K in keyof Options & {config: unknown}]: unknown
})
export const router = trpc.router({
  generate: trpc.procedure
    .meta({
      description: 'Scans source files for SQL queries and generates TypeScript interfaces for them.',
    })
    .input(Options)
    .mutation(async ({input: {config, psql, watch, ...input}}) => {
      const configModule = config && existsSync(config) ? ((await import(config)) as Record<string, unknown>) : null
      const baseOptions = configModule ? Options.parse(configModule?.default ?? configModule) : {}
      const run = await generate({
        ...baseOptions,
        ...(psql && {psql}),
        ...input,
      })

      if (watch || input.lazy) {
        run.watch()
      }
    }),
})
