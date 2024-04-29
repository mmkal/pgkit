import {sql} from '@pgkit/client'
import * as migra from '@pgkit/migra'
import {PostgreSQL} from '@pgkit/schemainspect'
import {fetchomatic} from 'fetchomatic'
import {z} from 'zod'
import {migrationsRotuer} from './migrations.js'
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
  execute2: publicProcedure
    .input(
      z.object({
        query: z.string(),
        values: z.array(z.any()),
      }),
    )
    .mutation(async ({input, ctx}) => {
      return {
        // todo: let raw accept values
        // results: await ctx.connection.query(sql.raw(input.query, input.values)),
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
  aiQuery: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        includeSchemas: z.string().optional(),
        excludeSchemas: z.string().optional(),
      }),
    )
    .mutation(async ({input, ctx}) => {
      const f = fetchomatic(fetch)
      const OllamaApiResponse = z.object({
        model: z.string(),
        created_at: z.string(),
        response: z.string(),
        done: z.boolean(),
        context: z.any(),
        total_duration: z.number(),
        load_duration: z.number(),
        prompt_eval_count: z.number(),
        prompt_eval_duration: z.number(),
        eval_count: z.number(),
        eval_duration: z.number(),
      })
      const client = ctx.connection

      const m = await migra.run('EMPTY', client)

      const markedUpPrompt = [
        `You are a very capable database administrator and you will need to write a PostgreSQL query.`,
        `First you will be given information about the database schema. Then you will be given the description of the query desired.`,
        `You should only output the SQL query, any notes should be limited to what's strictly necessary and must be embedded within the query as inline comments.`,
        '',
        `Here is the schema information:`,
        '',
        `\`\`\`sql`,
        m.sql.split('\n'),
        `\`\`\``,
        '',
        `And here is the query description:`,
        '',
        input.prompt,
      ]

      const res = await f
        .withHeaders({
          'Content-Type': 'application/json',
        })
        .withParser({
          parser: {
            json: OllamaApiResponse.pick({response: true}),
          },
        })
        .fetch('http://localhost:11434/api/generate', {
          method: 'post',
          body: JSON.stringify({
            model: 'llama3',
            prompt: markedUpPrompt.join('\n'),
            stream: false,
          }),
        })

      let {response: query} = (await res.json()) as {response: string}

      if (query.includes('```')) {
        query = query.split('```')[1]
        if (query.startsWith('sql\n')) {
          query = query.slice(4)
        }
      }

      return {
        query: query,
        now: Date.now(),
      }
    }),
  migrations: migrationsRotuer,
})

const filterInspected = (
  schema: ReturnType<PostgreSQL['toJSON']>,
  settings: {includeSchemas?: string; excludeSchemas?: string},
) => {
  const filtered: Record<string, unknown> = {...schema}
  const includeSchemas = new RegExp(settings.includeSchemas || '.*')
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
