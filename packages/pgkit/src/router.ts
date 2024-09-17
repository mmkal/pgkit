import {Client, createClient} from '@pgkit/client'
import {Migrator, createMigratorRouter} from '@pgkit/migrator'
import {confirm} from '@pgkit/migrator/dist/cli'
import {router as typegenRouter} from '@pgkit/typegen'
import express from 'express'
import * as trpcCli from 'trpc-cli'
import {z} from 'trpc-cli'
import {loadConfig} from './config'

const t = trpcCli.trpcServer.initTRPC.meta<trpcCli.TrpcCliMeta>().create()

const procedureWithClient = t.procedure.use(async ({ctx, next}) => {
  const config = await loadConfig()
  const client = (clientSingleton.client ||= createClient(config.client.connectionString))
  const migrator = (clientSingleton.migrator ||= new Migrator({
    client,
    migrationsPath: config.migrator?.migrationsPath,
    migrationTableName: config.migrator?.migrationTableName,
  }))
  return next({
    ctx: {...ctx, client, migrator},
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
  ...typegenRouter._def.procedures,
  admin: procedureWithClient
    .input(
      z.object({
        port: z.number().default(7002),
      }),
    )
    .mutation(async ({input, ctx}) => {
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
