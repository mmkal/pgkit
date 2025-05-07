import {Client, createClient, sql} from '@pgkit/client'
import {Migrator, createMigratorRouter} from '@pgkit/migrator'
import {confirm} from '@pgkit/migrator/dist/cli'
import {defaults, generate} from '@pgkit/typegen'
import express from 'express'
import * as fs from 'fs'
import * as trpcCli from 'trpc-cli'
import {z} from 'trpc-cli'
import {loadConfig} from './config'

const t = trpcCli.trpcServer.initTRPC.meta<trpcCli.TrpcCliMeta>().create()

const procedureWithClient = t.procedure.use(async ({ctx, next}) => {
  const config = await loadConfig()
  const client = (clientSingleton.client ||= createClient(config.client.connectionString))
  const migratorOptions = typeof config.migrator === 'function' ? config.migrator({client}) : config.migrator
  const migrator = (clientSingleton.migrator ||= new Migrator({client, ...migratorOptions}))
  return next({
    ctx: {...ctx, client, migrator, config},
  })
})

const clientSingleton = {
  client: null as null | Client,
  migrator: null as null | Migrator,
}

export const router = t.router({
  query: procedureWithClient
    .meta({
      aliases: {
        command: ['q'],
        options: {
          param: 'p',
          method: 'm',
        },
      },
    })
    .input(
      z.tuple([
        z.string().describe('Either a filepath to a .sql file or a string to be executed directly'),
        z.object({
          param: z
            .array(z.union([z.string(), z.number()]))
            .describe('Parameters to be passed to the query. The query should format these as $1, $2 etc.')
            .optional(),
          method: z
            .enum(['query', 'any', 'one', 'maybeOne', 'oneFirst', 'maybeOneFirst', 'anyFirst', 'many', 'manyFirst'])
            .describe("Client method to use. Use `one` to throw if doesn't return exactly one row, for example.")
            .default('any')
            .optional(),
          replacements: z
            .string()
            .transform(s => s.split(':'))
            .pipe(z.tuple([z.string(), z.string()]))
            .array()
            .describe(
              "Replace substrings in the raw query before executing. Format a:b. Defaults to ~:' (to facilitate bash scripting with single quotes)",
            )
            .optional(),
        }),
      ]),
    )
    .mutation(async ({ctx, input: [fileOrQuery, options]}) => {
      let query = fs.existsSync(fileOrQuery) ? fs.readFileSync(fileOrQuery, 'utf8') : fileOrQuery
      const replacements = options?.replacements ?? [['~', `'`]]
      replacements.forEach(([a, b]) => {
        query = query.replaceAll(a, b)
      })
      const method = options?.method ?? 'any'
      return ctx.client[method](sql.raw(query, options?.param))
    }),
  migrate: createMigratorRouter(
    procedureWithClient.use(async ({ctx, next}) => {
      return next({ctx: {...ctx, confirm}})
    }),
  )._def.record, // todo: figure out why it doesn't like the actual router
  empty: procedureWithClient.mutation(async ({ctx}) => {
    const migrator = ctx.migrator
    // get a wipe diff since this will *drop* tables in reverse dependency order. We want to truncate them in that order since foreign key constraints could otherwise prevent deletions
    // update: uuuh this doesn't work, it drops tables in a seemingly arbitrary order. i guess migra isn't doing topological sorting yet.
    const wipeDiff = await migrator.wipeDiff()
    const statements = wipeDiff.split(';').flatMap(s => {
      s = s.trim()
      const lower = s.toLowerCase()
      const dropTablePrefix = 'drop table '
      const dropTableIndex = lower.indexOf(dropTablePrefix)
      if (dropTableIndex === -1) return []
      if (dropTableIndex !== 0)
        throw new Error(`Expected drop table statement to start with "${dropTablePrefix}"`, {cause: s})

      const truncateStatement = s.replace(dropTablePrefix, `truncate table `)

      return [truncateStatement]
    })

    const truncateQuery = statements.join(';\n\n')
    const confirmed = await confirm(truncateQuery)
    if (confirmed) {
      await ctx.client.query(sql.raw(truncateQuery))
    }
  }),
  generate: procedureWithClient
    .use(async ({getRawInput, ctx, next}) => {
      const rawInput = getRawInput() as {}
      const inputObject = typeof rawInput === 'object' ? Object.keys(rawInput || {}) : []
      return next({
        ctx: {...ctx, inputKeys: new Set(Object.keys(inputObject))},
      })
    })
    .input(
      z.object({
        watch: z
          .boolean()
          .optional()
          .describe(
            'Run the type checker in watch mode. Files will be run through the code generator when changed or added.',
          ),
        lazy: z.boolean().optional().describe('Skip initial processing of input files. Implies --watch.'),
      }),
    )
    .mutation(async ({ctx, input: {watch, ...input}}) => {
      watch = watch ?? input.lazy
      if (input.lazy && !watch) throw new Error('Cannot specify --watch=false and --lazy')

      const typegenOptions =
        typeof ctx.config.typegen === 'function'
          ? ctx.config.typegen({defaults, client: ctx.client})
          : ctx.config.typegen

      const run = await generate({
        connectionString: ctx.client,
        ...input,
        ...(typegenOptions &&
          Object.fromEntries(
            Object.entries(typegenOptions).filter(([key]) => !ctx.inputKeys.has(key)), // don't override options explicitly passed, do override defaults
          )),
      })

      if (watch) {
        await run.watch()
      }
    }),
  admin: procedureWithClient
    .input(
      z.object({
        port: z.number().default(7002),
      }),
    )
    .output(z.void())
    .mutation(async ({input, ctx}): Promise<void> => {
      const {getExpressRouter} = await import('@pgkit/admin').catch(cause => {
        throw new Error('Admin UI is a peer dependency. Please install @pgkit/admin to use this feature.', {cause})
      })
      const app = express()
      app.use(getExpressRouter(ctx.client))
      app.listen(input.port, () => {
        // eslint-disable-next-line no-console
        console.log(`Admin UI listening on http://localhost:${input.port}`)
      })
      return new Promise(_r => {})
    }),
}) as trpcCli.AnyRouter
