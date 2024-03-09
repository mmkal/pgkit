import {sql} from '@pgkit/client'
import {PostgreSQL} from '@pgkit/schemainspect'
import {z} from 'zod'
import {runQuery} from './query.js'
import {publicProcedure, trpc} from './trpc.js'

export const appRouter = trpc.router({
  healthcheck: publicProcedure.query(
    async () => ({ok: 1}), //
  ),
  executeSql: publicProcedure
    .input(
      z.object({query: z.string()}), //
    )
    .mutation(async ({input, ctx}) => {
      return {
        results: await runQuery(input.query, ctx),
      }
    }),
  inspect: publicProcedure
    .input(
      z.object({
        includeSchemas: z.string().optional(),
        excludeSchemas: z.string().optional(),
      }),
    )
    .query(async ({input, ctx}) => {
      const client = ctx.connection
      const inspector = await PostgreSQL.create(client)
      const searchPath = await client.oneFirst<{search_path: string}>(sql`show search_path`)
      return {
        inspected: filterInspected(inspector.toJSON(), input),
        searchPath,
      }
    }),
})

const filterInspected = (
  schema: ReturnType<PostgreSQL['toJSON']>,
  settings: {includeSchemas?: string; excludeSchemas?: string},
) => {
  const filtered: any = {...schema}
  // eslint-disable-next-line mmkal/@rushstack/security/no-unsafe-regexp
  const includeSchemas = new RegExp(settings.includeSchemas || '.*')
  // eslint-disable-next-line mmkal/@rushstack/security/no-unsafe-regexp
  const excludeSchemas = new RegExp(settings.excludeSchemas || '$x')

  Object.entries(schema).forEach(([prop, dictionary]) => {
    const isFilterable =
      dictionary && typeof dictionary === 'object' && typeof Object.values(dictionary)?.at(0)?.schema === 'string'
    if (isFilterable) {
      const filteredDictionary = Object.fromEntries(
        Object.entries<{schema: string}>(dictionary as {}).filter(([_key, value]) => {
          if (!includeSchemas.test(value.schema)) return false
          if (excludeSchemas.test(value.schema)) return false
          return true
        }),
      )
      filtered[prop] = filteredDictionary
    }
  })
  return filtered as typeof schema
}

export type AppRouter = typeof appRouter
