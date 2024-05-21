import {Migrator, createMigratorRouter} from '@pgkit/migrator'
import {rm, writeFile} from 'fs/promises'
import * as path from 'path'
import {z} from 'zod'
import {trpc} from './trpc.js'

const migrator = new Migrator({
  client: process.env.PGKIT_CLIENT || 'postgresql://postgres:postgres@localhost:5432/postgres',
  migrationsPath: process.env.PGKIT_MIGRATIONS_PATH || path.join(process.cwd(), 'migrations'),
  migrationTableName: process.env.PGKIT_MIGRATIONS_TABLE_NAME,
})

const migratorProcedure = trpc.procedure
  .input(z.object({confirmation: z.string().optional()}).optional())
  .use(async ({next, input}) => {
    return next({
      ctx: {
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
  createMigratorRouter({procedure: migratorProcedure}),
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
// import {Migrator} from '@pgkit/migrator'
// import {createMigratorRouter} from '@pgkit/migrator/dist/router.js'
// import * as fs from 'fs'
// import * as path from 'path'
// import {z} from 'zod'
// import {ServerContext} from './context.js'
// import {publicProcedure as baseProcedure, trpc} from './trpc.js'

// const migrationsProcedure = baseProcedure
//   .input(z.object({confirmation: z.string().optional()}).optional())
//   .use(({input, ctx, next}) => {
//     return next({
//       ctx: {
//         ...ctx,
//         confirm: async (sql: string) => {
//           if (sql.trim() && input?.confirmation?.trim() === sql.trim()) {
//             return true
//           }
//           if (!sql.trim()) {
//             return false
//           }
//           throw new Error('confirmation_missing:' + sql.trim())
//         },
//       },
//     })
//   })

// const getMigrator = async (ctx: ServerContext) => {
//   const migrationsDir = path.join(process.cwd(), 'zignoreme/migrator')
//   // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
//   const migrator: Migrator = process.env.MIGRATOR_MODULE
//     ? // eslint-disable-next-line unicorn/no-await-expression-member
//       (await import(process.env.MIGRATOR_MODULE)).default
//     : new Migrator({
//         client: ctx.connection as never,
//         migrationsPath: path.join(migrationsDir, 'migrations'),
//         migrationTableName: 'admin_test_migrations',
//       })
//   fs.mkdirSync(migrationsDir, {recursive: true})
//   return migrator
// }

// const getMigratorStuff = async (ctx: ServerContext) => {
//   const migrator = await getMigrator(ctx)
//   return {
//     migrationsDir: migrator.migratorOptions.migrationsPath,
//     migrator,
//     definitionsFile: migrator.definitionsFile,
//   }
// }

// const formatMigrations = <Status extends string>(migrations: {name: string; path?: string; status?: Status}[]) =>
//   migrations.map(m => ({name: m.name, path: m.path, status: m.status}))

// // export const migrationsRouter2 = createMigratorRouter()

// export const migrationsRouter = trpc.router({
//   up: migrationsProcedure
//     .input(
//       z
//         .object({
//           to: z.string().optional(),
//         })
//         .default({}),
//     )
//     .mutation(async ({ctx, input}) => {
//       const migrator = await getMigrator(ctx)
//       await migrator.up(input as never)
//       return formatMigrations(await migrator.list())
//     }),
//   down: migrationsProcedure
//     .input(
//       z.object({
//         // step: z.number().int().optional(),
//         to: z.string(), //.or(z.literal(0)).optional(),
//       }),
//     )
//     .mutation(async ({ctx, input}) => {
//       const migrator = await getMigrator(ctx)
//       await migrator.goto({name: input.to, confirm: ctx.confirm})
//     }),
//   check: migrationsProcedure.mutation(async ({ctx}) => {
//     const migrator = await getMigrator(ctx)
//     await migrator.check()
//   }),
//   repair: migrationsProcedure.mutation(async ({ctx}) => {
//     const migrator = await getMigrator(ctx)
//     await migrator.repair({confirm: ctx.confirm})
//   }),
//   rebase: migrationsProcedure
//     .input(
//       z.object({
//         from: z.string(),
//       }),
//     )
//     .mutation(async ({ctx, input}) => {
//       const migrator = await getMigrator(ctx)
//       await migrator.rebase({from: input.from, confirm: ctx.confirm})
//     }),
//   pending: migrationsProcedure.query(async ({ctx}) => {
//     const migrator = await getMigrator(ctx)
//     return formatMigrations(await migrator.pending())
//   }),
//   executed: migrationsProcedure.query(async ({ctx}) => {
//     const migrator = await getMigrator(ctx)
//     return formatMigrations(await migrator.executed())
//   }),
//   list: migrationsProcedure.query(async ({ctx}) => {
//     const migrator = await getMigrator(ctx)
//     const all = await migrator.list()

//     const migrations = formatMigrations(all)
//       .map(m => {
//         try {
//           return {
//             ...m,
//             path: m.path!,
//             content: fs.readFileSync(m.path!, 'utf8'),
//           }
//         } catch {
//           throw new Error(`Failed to read migration file ${m.path}`)
//         }
//       })
//       .sort((a, b) => a.path.localeCompare(b.path))

//     const stuff = await getMigratorStuff(ctx)
//     return {
//       migrations,
//       definitions: {
//         filepath: stuff.definitionsFile,
//         content:
//           stuff.definitionsFile && fs.existsSync(stuff.definitionsFile)
//             ? fs.readFileSync(stuff.definitionsFile, 'utf8')
//             : '',
//       },
//     }
//   }),
//   create: migrationsProcedure
//     .input(
//       z.object({
//         name: z.string(),
//       }),
//     )
//     .mutation(async ({input, ctx}) => {
//       const migrator = await getMigrator(ctx)
//       await migrator.create({name: input.name})
//     }),
//   // downify: publicProcedure
//   //   .input(
//   //     z.object({name: z.string()}), //
//   //   )
//   //   .mutation(async ({input, ctx}) => {
//   //     const migrator = await getMigrator(ctx)
//   //     const {content, info} = await migrator.generateDownMigration({name: input.name})

//   //     const downPath = migrator.downPath(info.migration.path as string)
//   //     await fs.promises.mkdir(path.dirname(downPath), {recursive: true})
//   //     await fs.promises.writeFile(downPath, content)
//   //     return {downPath, content}
//   //   }),
//   update: migrationsProcedure
//     .input(
//       z.object({
//         path: z.string(),
//         content: z.string().nullable(),
//       }),
//     )
//     .mutation(async ({ctx, input}) => {
//       const migrator = await getMigrator(ctx)
//       const pending = await migrator.pending()
//       const found: {name: string} | undefined = pending.find(x => x.path === input.path)

//       if (!found) {
//         console.log({pending})
//         // throw new TRPCError({
//         //   code: 'BAD_REQUEST',
//         //   message: `Migration ${input.path} not found. You need to create it first, you can't update arbitrary files.`,
//         // })
//       }

//       if (input.content === null) {
//         await fs.promises.unlink(input.path)
//       } else {
//         await fs.promises.writeFile(input.path, input.content)
//       }
//     }),
//   // migra: publicProcedure.query(async ({ctx}) => {
//   //   const migrator = await getMigrator(ctx)
//   //   const {sql} = await migrator.runMigra()
//   //   return {sql}
//   // }),
//   updateDefintionsFromDB: migrationsProcedure.mutation(async ({ctx}) => {
//     const migrator = await getMigrator(ctx)
//     await migrator.updateDDLFromDB()
//   }),
//   updateDBFromDefinitions: migrationsProcedure.mutation(async ({ctx}) => {
//     const migrator = await getMigrator(ctx)
//     await migrator.updateDBFromDDL({confirm: ctx.confirm})
//   }),
// })
