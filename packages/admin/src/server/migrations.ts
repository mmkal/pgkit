import {Migrator} from '@pgkit/migrator'
import * as fs from 'fs'
import * as path from 'path'
import {z} from 'zod'
import {ServerContext} from './context.js'
import {publicProcedure, trpc} from './trpc.js'

const getMigratorStuff = (ctx: ServerContext) => {
  const migrationsDir = path.join(process.cwd(), 'zignoreme/migrator')
  const migrator = new Migrator({
    client: ctx.connection as never,
    migrationsPath: path.join(migrationsDir, 'migrations'),
    migrationTableName: 'admin_test_migrations',
  })
  fs.mkdirSync(migrationsDir, {recursive: true})
  return {
    migrationsDir,
    migrator,
    definitionsFile: path.join(migrationsDir, 'definitions.sql'),
  }
}

const getMigrator = (ctx: ServerContext) => getMigratorStuff(ctx).migrator

const formatMigrations = (migrations: {name: string; path?: string}[]) =>
  migrations.map(m => ({name: m.name, path: m.path}))

export const migrationsRotuer = trpc.router({
  up: publicProcedure
    .input(
      z
        .object({
          step: z.number().int().optional(),
          to: z.string().optional(),
        })
        .default({}),
    )
    .mutation(async ({ctx, input}) => {
      return formatMigrations(await getMigrator(ctx).up(input as never))
    }),
  down: publicProcedure
    .input(
      z
        .object({
          step: z.number().int().optional(),
          to: z.string().or(z.literal(0)).optional(),
        })
        .default({}),
    )
    .mutation(async ({ctx, input}) => {
      return formatMigrations(await getMigrator(ctx).down(input as never))
    }),
  pending: publicProcedure.query(async ({ctx}) => {
    return formatMigrations(await getMigrator(ctx).pending())
  }),
  executed: publicProcedure.query(async ({ctx}) => {
    return formatMigrations(await getMigrator(ctx).executed())
  }),
  list: publicProcedure.query(async ({ctx}) => {
    const pending = await getMigrator(ctx).pending()
    const executed = await getMigrator(ctx).executed()
    const all = [
      ...executed.map(x => ({...x, status: 'executed' as const})),
      ...pending.map(x => ({...x, status: 'pending' as const})), //
    ]

    const migrations = formatMigrations(all)
      .map(m => {
        const downPath = getMigrator(ctx).downPath(m.path!)
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

    const stuff = getMigratorStuff(ctx)
    return {
      migrations,
      definitions: {
        filepath: stuff.definitionsFile,
        content: fs.existsSync(stuff.definitionsFile) ? fs.readFileSync(stuff.definitionsFile, 'utf8') : '',
      },
    }
  }),
  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .mutation(async ({input, ctx}) => {
      await getMigrator(ctx).create({name: input.name})
    }),
  downify: publicProcedure
    .input(
      z.object({name: z.string()}), //
    )
    .mutation(async ({input, ctx}) => {
      const migrator = getMigrator(ctx)
      const {content, info} = await migrator.generateDownMigration({name: input.name})

      const downPath = migrator.downPath(info.migration.path as string)
      await fs.promises.writeFile(downPath, content)
      return {downPath, content}
    }),
  update: publicProcedure
    .input(
      z.object({
        path: z.string(),
        content: z.string().nullable(),
      }),
    )
    .mutation(async ({ctx, input}) => {
      const pending = await getMigrator(ctx).pending()
      let found = pending.find(x => x.path === input.path)

      if (!found) {
        const executed = await getMigrator(ctx).executed()
        found = executed.find(x => getMigrator(ctx).downPath(x.path!) === input.path)
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
  migra: publicProcedure.query(async ({ctx}) => {
    const {sql} = await getMigrator(ctx).runMigra()
    return {sql}
  }),
  definitions: publicProcedure.mutation(async ({ctx}) => {
    await getMigrator(ctx).writeDefinitionFile(getMigratorStuff(ctx).definitionsFile)
  }),
})
