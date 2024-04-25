import {Migrator} from '@pgkit/migrator'
import * as fs from 'fs'
import * as path from 'path'
import {z} from 'zod'
import {publicProcedure, trpc} from './trpc.js'

const migrationsProcedure = publicProcedure.use(x => {
  const migrationsDir = path.join(process.cwd(), 'zignoreme/migrator')
  const migrator = new Migrator({
    client: x.ctx.connection as never,
    migrationsPath: path.join(migrationsDir, 'migrations'),
    migrationTableName: 'admin_test_migrations',
  })
  fs.mkdirSync(migrationsDir, {recursive: true})
  return x.next({
    ctx: {
      ...x.ctx,
      migrationsDir,
      migrator,
      definitionsFile: path.join(migrationsDir, 'definitions.sql'),
    },
  })
})

export const migrationsRotuer = trpc.router({
  up: migrationsProcedure.mutation(async ({ctx}) => {
    return ctx.migrator.up()
  }),
  down: migrationsProcedure.mutation(async ({ctx}) => {
    return ctx.migrator.down()
  }),
  pending: migrationsProcedure.query(async ({ctx}) => {
    return ctx.migrator.pending()
  }),
  executed: migrationsProcedure.query(async ({ctx}) => {
    return ctx.migrator.executed()
  }),
  list: migrationsProcedure.query(async ({ctx}) => {
    const pending = await ctx.migrator.pending()
    const executed = await ctx.migrator.executed()
    const all = [
      ...executed.map(x => ({...x, status: 'executed' as const})),
      ...pending.map(x => ({...x, status: 'pending' as const})), //
    ]

    const migrations = all
      .map(m => {
        const downPath = ctx.migrator.downPath(m.path!)
        return {
          ...m,
          path: m.path!,
          content: fs.readFileSync(m.path!, 'utf8'),
          ...(fs.existsSync(downPath) && {
            downPath,
            downContent: fs.readFileSync(downPath, 'utf8'),
          }),
        }
      })
      .sort((a, b) => a.path.localeCompare(b.path))

    return {
      migrations,
      definitions: {
        filepath: ctx.definitionsFile,
        content: fs.existsSync(ctx.definitionsFile) ? fs.readFileSync(ctx.definitionsFile, 'utf8') : '',
      },
    }
  }),
  create: migrationsProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .mutation(async ({input, ctx}) => {
      return ctx.migrator.create({
        name: input.name,
      })
    }),
  downify: migrationsProcedure
    .input(
      z.object({name: z.string()}), //
    )
    .mutation(async ({input, ctx}) => {
      const {content, info} = await ctx.migrator.generateDownMigration({name: input.name})

      await fs.promises.writeFile(ctx.migrator.downPath(info.migration.path as string), content)
    }),
  update: migrationsProcedure
    .input(
      z.object({
        path: z.string(),
        content: z.string().nullable(),
      }),
    )
    .mutation(async ({ctx, input}) => {
      const pending = await ctx.migrator.pending()
      let found = pending.find(x => x.path === input.path)

      if (!found) {
        const executed = await ctx.migrator.executed()
        found = executed.find(x => ctx.migrator.downPath(x.path!) === input.path)
      }

      if (!found) {
        console.log({pending})
        // throw new TRPCError({
        //   code: 'BAD_REQUEST',
        //   message: `Migration ${input.path} not found. You need to create it first, you can't update arbitrary files.`,
        // })
      }

      if (input.content === null) {
        await fs.promises.unlink(input.path)
      } else {
        await fs.promises.writeFile(input.path, input.content)
      }
    }),
  migra: migrationsProcedure.query(async ({ctx}) => {
    const migra = await ctx.migrator.runMigra()
    return {sql: migra.sql}
  }),
  definitions: migrationsProcedure.mutation(async ({ctx}) => {
    await ctx.migrator.writeDefinitionFile(ctx.definitionsFile)
  }),
})
