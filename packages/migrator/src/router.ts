import {sql} from '@pgkit/client'
import * as trpcServer from '@trpc/server'
import {readFile} from 'fs/promises'
import z from 'zod'
import {Migrator} from './migrator'
import {Confirm} from './types'

export interface MigratorRouterContext {
  migrator: Migrator
  confirm: Confirm
}

/** Based on `cleye`'s `HelpOptions` */
export interface MigratorRouterMeta {
  /** Description of the script or command to display in `--help` output. */
  description?: string
  /** Usage code examples to display in `--help` output. */
  usage?: false | string | string[]
  /** Example code snippets to display in `--help` output. */
  examples?: string | string[]
}

/** Helper type that IMO should exist in trpc. Basically a type which a trpc-procedure with context of type `Ctx` will satisfy */
export type TRPCProcedureLike<Ctx> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutation: (resolver: (opts: {ctx: Ctx; input: any}) => any) => any
}

/** Parameters needed for a helper function returning a router, which can be used as a sub-router for another. */
export interface TRPCHelperParams<Ctx> {
  /** The `trpc.procedure` function. A middleware can be used to align context types. */
  procedure: TRPCProcedureLike<Ctx>
}

export const migratorTrpc = trpcServer.initTRPC
  .context<MigratorRouterContext>()
  .meta<MigratorRouterMeta>()
  .create() satisfies TRPCHelperParams<MigratorRouterContext> // use `satisfies` to make sure the `TRPCProcedureLike` type helper is correct

/**
 * Get a router with procedures needed to manage migrations.
 *
 * @param procedure - TRPC procedure builder for the router this will be attached to. Must have the correct context type
 *
 * @example
 * import {createMigratorRouter, Migrator} from '@pgkit/migrator'
 * import {initTRPC} from '@trpc/server'
 *
 * const t = initTRPC.context<YourAppContext>().create()
 *
 * export const yourAppRouter = t.router({
 *   yourProcedeure: t.procedure.query(async () => 'Hello, world!'),
 *   migrations: getMigrationsRouter(),
 * })
 *
 * function getMigrationsRouter() {
 *   return createMigratorRouter(
 *     t.procedure.use(async ({ctx, next}) => {
 *       return next({
 *         ctx: {
 *           migrator: new Migrator(___),
 *           confirm: async (sql: string) => {
 *             return ctx.whitelistedSql.includes(sql)
 *           },
 *         }
 *       })
 *     })
 *   )
 * }
 */
export const createMigratorRouter = (procedure: TRPCProcedureLike<MigratorRouterContext> = migratorTrpc.procedure) => {
  // Take advantage of trpc being overly lax about merging routers with different contexts: https://github.com/trpc/trpc/issues/4306
  // We have used the `TRPCProcedureLike` type to ensure that the context is correct for the procedure builder, and trpc will merge the routers without checking the context
  // This means any router with a different context type can use this helper to creater a migrations sub-router, by just defining a middleware that sets the correct context
  const trpc = {router: migratorTrpc.router, procedure: procedure} as typeof migratorTrpc

  const router = migratorTrpc.router({
    up: trpc.procedure
      .meta({description: 'Apply pending migrations'})
      .input(
        z
          .union([
            z.object({}).strict(), //
            z.object({to: z.string().describe('Only apply migrations up to this one')}),
            z.object({step: z.number().int().positive().describe('Apply this many migrations')}),
          ])
          .optional(),
      )
      .mutation(async ({input, ctx}) => {
        return ctx.migrator.up(input)
      }),
    create: trpc.procedure
      .meta({description: 'Create a new migration file'})
      .input(
        z.object({
          content: z
            .string()
            .optional()
            .describe(
              'SQL content of the migration. If not specified, content will be generated based on the calculated diff between the existing migrations and the current database state.',
            ),
          name: z
            .string()
            .optional()
            .describe(
              'Name of the migration file. If not specified, a name will be generated based on the content of the migraiton',
            ),
        }),
      )
      .mutation(async ({input, ctx}) => {
        return ctx.migrator.create(input)
      }),
    list: trpc.procedure
      .meta({
        description: 'List migrations, along with their status, file path and content',
      })
      .input(
        z.object({
          query: z
            .string()
            .optional()
            .describe('Search query - migrations with names containing this string will be returned'),
          status: z.enum(['pending', 'executed']).optional().describe('Filter by status'),
          result: z
            .enum(['first', 'last', 'one', 'maybeOne', 'all'])
            .default('all')
            .describe('Which result(s) to return'),
          output: z
            .enum(['name', 'path', 'content', 'object'])
            .default('object')
            .describe('Result properties to return'),
        }),
      )
      .query(async ({input, ctx}) => {
        const list = await ctx.migrator.list()
        const results = list
          .filter(m => {
            return m.name.includes(input.query || '') && m.status === (input.status || m.status)
          })
          .map(m => {
            if (input.output === 'name') return m.name
            if (input.output === 'path') return m.path
            if (input.output === 'content') return m.content
            return m
          })

        if (input.result === 'all') return results

        if (input.result === 'one' && results.length !== 1) {
          throw new Error(
            `Expected exactly one migration matching query ${JSON.stringify(input.query)}, found ${results.length}`,
            {
              cause: {results},
            },
          )
        }

        if (input.result === 'maybeOne' && results.length !== 1) return undefined
        if (input.result === 'first') return results[0]
        if (input.result === 'last') return results.at(-1)
      }),
    latest: trpc.procedure
      .meta({
        description: 'Get the latest migration',
      })
      .input(
        z.object({
          skipCheck: z.boolean().optional().describe('Skip checking that migrations are in a valid state'),
        }),
      )
      .query(async ({input, ctx}) => {
        return ctx.migrator.latest(input)
      }),
    check: trpc.procedure
      .meta({description: 'Verify that your database is in an expected state, matching your migrations'})
      .mutation(async ({ctx}) => {
        return ctx.migrator.check()
      }),
    repair: trpc.procedure
      .meta({
        description:
          'If your migrations are not in a valid state, this will calculate the diff required to move your database to a valid state, and apply it',
      })
      .mutation(async ({ctx}) => {
        return ctx.migrator.repair({confirm: ctx.confirm})
      }),
    goto: trpc.procedure
      .meta({
        description:
          'Go "back" to a specific migration. This will calculate the diff required to get to the target migration, then apply it',
      })
      .input(
        z.object({
          name: z.string().describe('Name of the migration to go to. Use "list" to see available migrations.'),
        }),
      )
      .mutation(async ({input, ctx}) => {
        return ctx.migrator.goto({name: input.name, confirm: ctx.confirm})
      }),
    baseline: trpc.procedure
      .meta({
        description:
          'Baseline the database at the specified migration. This forcibly edits the migrations table to mark all migrations up to this point as executed. Useful for introducing the migrator to an existing database.',
      })
      .input(
        z.object({
          to: z.string().describe('Name of the migration to baseline to. Use `list` to see available migrations.'),
          purgeDisk: z.boolean().default(false).describe('Delete files subsequent to the specified migration'),
        }),
      )
      .mutation(async ({input, ctx}) => {
        return ctx.migrator.baseline({...input, to: input.to, confirm: ctx.confirm})
      }),
    rebase: trpc.procedure
      .meta({
        description:
          'Rebase the migrations from the specified migration. This deletes all migration files after this point, and replaces them with a squashed migration based on the calculated diff required to reach the current database state.',
      })
      .input(
        z.object({
          from: z
            .string()
            .describe(
              'Name of the migration to rebase from. This migration will remain, all subsequent ones will be replaced with a squashed migration. Use `list` to see available migrations.',
            ),
        }),
      )
      .mutation(async ({input, ctx}) => {
        return ctx.migrator.rebase({...input, confirm: ctx.confirm})
      }),
    definitions: trpc.router({
      filepath: trpc.procedure
        .meta({
          description: 'Get the path to the definitions file',
        })
        .query(async ({ctx}) => {
          return {
            path: ctx.migrator.definitionsFile,
            content: await readFile(ctx.migrator.definitionsFile, 'utf8'),
          }
        }),
      updateDb: trpc.procedure
        .meta({description: 'Update the database from the definitions file'})
        .mutation(async ({ctx}) => {
          return ctx.migrator.updateDbToMatchDefinitions({confirm: ctx.confirm})
        }),
      updateFile: trpc.procedure
        .meta({description: 'Update the definitions file from the database'})
        .mutation(async ({ctx}) => {
          return ctx.migrator.updateDefinitionsToMatchDb({confirm: ctx.confirm})
        }),
    }),
    unlock: trpc.procedure
      .meta({
        description:
          'Release the advisory lock for this migrator on the database. This is useful if the migrator is stuck due to a previous crash',
      })
      .mutation(async ({ctx}) => {
        return ctx.migrator.unlock({confirm: ctx.confirm})
      }),
    wipe: trpc.procedure
      .meta({
        description: 'Wipe the database - remove all tables, views etc.',
      })
      .mutation(async ({ctx}) => {
        return ctx.migrator.wipe({confirm: ctx.confirm})
      }),
    sql: trpc.procedure
      .meta({
        description:
          'Query the database. Not strictly related to migrations, but can be used for debugging. Use with caution!',
      })
      .input(
        z.object({
          query: z.string(),
          singlequote: z
            .string()
            .describe("Character to use in place of ' - use to avoid having to do bash quote-escaping")
            .optional(),
          doublequote: z
            .string()
            .describe('Character to use in place of " - use to avoid having to do bash quote-escaping')
            .optional(),
          method: z
            .enum(['any', 'many', 'one', 'maybeOne', 'query', 'anyFirst', 'oneFirst', 'maybeOneFirst'])
            .default('any'),
        }),
      )
      .mutation(async ({input, ctx}) => {
        let query = input.query
        if (input.singlequote) query = query.replaceAll(input.singlequote, `'`)
        if (input.doublequote) query = query.replaceAll(input.doublequote, `"`)

        return ctx.migrator.client[input.method](sql.raw(query))
      }),
  })

  return router
}
