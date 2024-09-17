import {existsSync} from 'fs'
import * as path from 'path'
import {trpcServer, z, TrpcCliMeta} from 'trpc-cli'
import * as defaults from './defaults'
import {generate, Options} from './generate'

const trpc = trpcServer.initTRPC.meta<TrpcCliMeta>().create()

// todo: deprecate in favour of inputs more like the ones in pgkit
export const CliOptions = z
  .object({
    config: z
      .string()
      .optional()
      .default(existsSync(defaults.typegenConfigFile) ? defaults.typegenConfigFile : (undefined as never))
      .describe(
        'Path to a module containing parameters to be passed to generate. Note: any options passed on the command line will override those in the config file.',
      ),
    rootDir: z
      .string()
      .default(defaults.defaultRootDir)
      .describe('Path to the source directory containing SQL queries.'),
    connectionString: z
      .string()
      .optional()
      .describe(`URI for connecting to postgres. Defaults to \`${defaults.defaultConnectionString}\``),
    psql: z
      .string()
      .optional()
      .describe(
        'psql command used to query postgres via CLI client. Defaults to `pql`, but if using docker, you may want to use `docker-compose exec -T postgres psql`',
      ),
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
    checkClean: z
      .array(z.enum(['before-migrate', 'after-migrate']))
      .default([])
      .describe('Run a git check to make sure there are no working changes before/after modifying source files.'),
    watch: z
      .boolean()
      .optional()
      .describe(
        'Run the type checker in watch mode. Files will be run through the code generator when changed or added.',
      ),
    lazy: z.boolean().optional().describe('Skip initial processing of input files. Implies --watch.'),
  } satisfies {
    [K in keyof Options & {config: unknown}]: unknown
  })
  .transform(val => ({
    ...val,
    watch: val.watch ?? val.lazy,
  }))

export const router = trpc.router({
  generate: trpc.procedure
    .use(async ({rawInput, ctx, next}) => {
      const inputObject = typeof rawInput === 'object' ? Object.keys(rawInput || {}) : []
      return next({
        ctx: {...ctx, inputKeys: new Set(Object.keys(inputObject))},
      })
    })
    .meta({
      description: 'Scans source files for SQL queries and generates TypeScript interfaces for them.',
    })
    .input(CliOptions)
    .mutation(async ({ctx, input: {config: configPath, psql, watch, ...input}}) => {
      let configModule: Partial<Options> | {default: Partial<Options>} | null = null

      if (!configPath && existsSync(defaults.typegenConfigFile)) {
        configPath = defaults.typegenConfigFile
      }

      if (configPath) {
        if (!/\/\\/.test(configPath)) configPath = path.join(process.cwd(), configPath)
        if (!existsSync(configPath)) {
          throw new Error(`Config file not found at path ${configPath}`)
        }
        configModule = (await import(configPath)) as {}
        while ('default' in configModule) {
          configModule = configModule.default as Partial<Options>
        }
      }

      const run = await generate({
        ...(psql && {psqlCommand: psql}),
        ...input,
        ...(configModule &&
          Object.fromEntries(
            Object.entries(configModule).filter(([key]) => !ctx.inputKeys.has(key)), // don't override options explicitly passed, do override defaults
          )),
      })

      if (watch) {
        await run.watch()
      }
    }),
})
