import {Migrator} from '@pgkit/migrator'
import * as fs from 'fs'
import * as path from 'path'
import {z} from 'zod'
import {ServerContext} from './context.js'
import {publicProcedure, trpc} from './trpc.js'

const getMigrator = async (ctx: ServerContext) => {
  const migrationsDir = path.join(process.cwd(), 'zignoreme/migrator')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const migrator: Migrator = process.env.MIGRATOR_MODULE
    ? // eslint-disable-next-line unicorn/no-await-expression-member
      (await import(process.env.MIGRATOR_MODULE)).default
    : new Migrator({
        client: ctx.connection as never,
        migrationsPath: path.join(migrationsDir, 'migrations'),
        migrationTableName: 'admin_test_migrations',
      })
  fs.mkdirSync(migrationsDir, {recursive: true})
  return migrator
}

const getMigratorStuff = async (ctx: ServerContext) => {
  const migrator = await getMigrator(ctx)
  return {
    migrationsDir: migrator.migratorOptions.migrationsPath,
    migrator,
    definitionsFile: migrator.definitionsFile,
  }
}

const formatMigrations = <Status extends string>(migrations: {name: string; path?: string; status?: Status}[]) =>
  migrations.map(m => ({name: m.name, path: m.path, status: m.status}))

const confirm = (_sql: string) => {
  return true
}

export const migrationsRotuer = trpc.router({
  up: publicProcedure
    .input(
      z
        .object({
          to: z.string().optional(),
        })
        .default({}),
    )
    .mutation(async ({ctx, input}) => {
      const migrator = await getMigrator(ctx)
      return formatMigrations(await migrator.up(input as never))
    }),
  down: publicProcedure
    .input(
      z.object({
        // step: z.number().int().optional(),
        to: z.string(), //.or(z.literal(0)).optional(),
      }),
    )
    .mutation(async ({ctx, input}) => {
      const migrator = await getMigrator(ctx)
      await migrator.goto({name: input.to, confirm})
    }),
  pending: publicProcedure.query(async ({ctx}) => {
    const migrator = await getMigrator(ctx)
    return formatMigrations(await migrator.pending())
  }),
  executed: publicProcedure.query(async ({ctx}) => {
    const migrator = await getMigrator(ctx)
    return formatMigrations(await migrator.executed())
  }),
  list: publicProcedure.query(async ({ctx}) => {
    const migrator = await getMigrator(ctx)
    const all = await migrator.list()

    const migrations = formatMigrations(all)
      .map(m => {
        try {
          return {
            ...m,
            path: m.path!,
            content: fs.readFileSync(m.path!, 'utf8'),
          }
        } catch {
          throw new Error(`Failed to read migration file ${m.path}`)
        }
      })
      .sort((a, b) => a.path.localeCompare(b.path))

    const stuff = await getMigratorStuff(ctx)
    return {
      migrations,
      definitions: {
        filepath: stuff.definitionsFile,
        content:
          stuff.definitionsFile && fs.existsSync(stuff.definitionsFile)
            ? fs.readFileSync(stuff.definitionsFile, 'utf8')
            : '',
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
      const migrator = await getMigrator(ctx)
      await migrator.create({name: input.name})
    }),
  // downify: publicProcedure
  //   .input(
  //     z.object({name: z.string()}), //
  //   )
  //   .mutation(async ({input, ctx}) => {
  //     const migrator = await getMigrator(ctx)
  //     const {content, info} = await migrator.generateDownMigration({name: input.name})

  //     const downPath = migrator.downPath(info.migration.path as string)
  //     await fs.promises.mkdir(path.dirname(downPath), {recursive: true})
  //     await fs.promises.writeFile(downPath, content)
  //     return {downPath, content}
  //   }),
  update: publicProcedure
    .input(
      z.object({
        path: z.string(),
        content: z.string().nullable(),
      }),
    )
    .mutation(async ({ctx, input}) => {
      const migrator = await getMigrator(ctx)
      const pending = await migrator.pending()
      let found: {name: string} | undefined = pending.find(x => x.path === input.path)

      if (!found) {
        const executed = await migrator.executed()
        found = executed.find(x => migrator.downPath(x.path) === input.path)
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
  // migra: publicProcedure.query(async ({ctx}) => {
  //   const migrator = await getMigrator(ctx)
  //   const {sql} = await migrator.runMigra()
  //   return {sql}
  // }),
  definitions: publicProcedure.mutation(async ({ctx}) => {
    const migrator = await getMigrator(ctx)
    await migrator.updateDDLFromDB()
  }),
})
