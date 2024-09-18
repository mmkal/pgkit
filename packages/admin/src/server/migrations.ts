import {Migrator, createMigratorRouter} from '@pgkit/migrator'
import {rm, writeFile} from 'fs/promises'
import * as path from 'path'
import {z} from 'zod'
import {trpc} from './trpc.js'

const migrator = new Migrator({
  client: process.env.PGKIT_CONNECTION_STRING || 'postgresql://postgres:postgres@localhost:5432/postgres',
  migrationsPath: process.env.PGKIT_MIGRATIONS_PATH || path.join(process.cwd(), 'migrations'),
  migrationTableName: process.env.PGKIT_MIGRATIONS_TABLE_NAME || 'migrations',
})

const migratorProcedure = trpc.procedure
  .input(
    z.object({confirmation: z.string().optional()}).optional(), //
  )
  .use(async ({next, input}) => {
    return next({
      ctx: {
        // todo: get from ctx
        migrator: migrator,
        confirm: async (checkSql: string) => {
          checkSql = checkSql.trim()
          if (!checkSql) {
            return false
          }

          const confirmation = input?.confirmation?.trim()
          if (!confirmation) {
            // todo: set a header instead. trpc doesn't make it easy to get response headers though
            throw new Error('confirmation_missing:' + checkSql)
          }

          return checkSql === confirmation
        },
      },
    })
  })

export const migrations2 = trpc.mergeRouters(
  createMigratorRouter(migratorProcedure),
  trpc.router({
    // override the default 'list' procedure which has a variable return type
    rawList: migratorProcedure.query(async ({ctx}) => {
      return ctx.migrator.list()
    }),
    update: migratorProcedure
      .input(z.object({path: z.string(), content: z.string().nullable()})) //
      .mutation(async ({input}) => {
        if (input.content === null) await rm(input.path)
        else await writeFile(input.path, input.content)
      }),
  }),
)
