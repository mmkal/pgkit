import {Client, createClient} from '@pgkit/client'
import {Migrator, createMigratorRouter} from '@pgkit/migrator'
import {confirm} from '@pgkit/migrator/dist/cli'
import {defaults, generate} from '@pgkit/typegen'
import express from 'express'
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
  migrate: createMigratorRouter(
    procedureWithClient.use(async ({ctx, next}) => {
      return next({ctx: {...ctx, confirm}})
    }),
  ),
  generate: procedureWithClient
    .use(async ({rawInput, ctx, next}) => {
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
      const {getExpressRouter} = await import('@pgkit/admin')
      const app = express()
      app.use(getExpressRouter(ctx.client))
      app.listen(input.port, () => {
        // eslint-disable-next-line no-console
        console.log(`Admin UI listening on http://localhost:${input.port}`)
      })
      return new Promise(_r => {})
    }),
})
