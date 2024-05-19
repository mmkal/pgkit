import {createClient, sql} from '@pgkit/client'
import {CommandLineAction, CommandLineFlagParameter, CommandLineStringParameter} from '@rushstack/ts-command-line'
import * as trpcServer from '@trpc/server'
import {prompt} from 'enquirer'
import z from 'zod'
import {Confirm, Migrator} from './migrator'
import {trpcCli} from './trpc-cli'

export const createMigratorRouter = (migrator: Migrator, {confirm}: {confirm: Confirm}) => {
  const trpc = trpcServer.initTRPC.context().meta<{description: string}>().create({})

  const appRotuer = trpc.router({
    sql: trpc.procedure
      .meta({description: 'Query the database'})
      .input(
        z.object({
          query: z.string(),
          method: z
            .enum(['any', 'many', 'one', 'maybeOne', 'query', 'anyFirst', 'oneFirst', 'maybeOneFirst'])
            .default('any'),
        }),
      )
      .mutation(async ({input}) => {
        return migrator.client[input.method](sql.raw(input.query))
      }),
    up: trpc.procedure
      .meta({description: 'Apply pending migrations'})
      .input(
        z.union([
          z.object({to: z.string().optional()}), //
          z.object({step: z.number().optional()}),
        ]),
      )
      .mutation(async ({input}) => {
        return migrator.up(input)
      }),
    list: trpc.procedure
      .meta({
        description: 'List all migrations, along with their status, file path and content',
      })
      .query(async () => {
        return migrator.list()
      }),
    search: trpc.procedure
      .meta({description: 'Find a migration by name'})
      .input(
        z.object({
          query: z.string().describe('Search query - migrations with names containing this string will be returned'),
          status: z.enum(['pending', 'executed']).optional(),
          result: z.enum(['first', 'last', 'one', 'maybeOne', 'all']).default('all'),
          output: z.enum(['name', 'path', 'content', 'object', 'json']).default('object'),
        }),
      )
      .query(async ({input}) => {
        const list = await migrator.list()
        const results = list
          .filter(m => {
            return m.name.includes(input.query) && m.status === (input.status || m.status)
          })
          .map(m => {
            if (input.output === 'name') return m.name
            if (input.output === 'path') return m.path
            if (input.output === 'content') return m.content
            if (input.output === 'json') return m
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
      .query(async ({input}) => {
        return migrator.latest(input)
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
      .mutation(async ({input}) => {
        return migrator.create(input)
      }),
    check: trpc.procedure
      .meta({description: 'Verify that your database is in an expected state, matching your migrations'})
      .mutation(async () => {
        return migrator.check()
      }),
    repair: trpc.procedure
      .meta({
        description:
          'If your migrations are not in a valid state, this will calculate the diff required to move your databse to a valid state, and apply it',
      })
      .mutation(async () => {
        return migrator.repair({confirm})
      }),
    goto: trpc.procedure
      .meta({
        description:
          'Go "back" to a specific migration. This will calculate the diff required to get to the target migration, then apply it',
      })
      .input(z.object({name: z.string()}))
      .mutation(async ({input}) => {
        return migrator.goto({
          name: input.name,
          confirm,
        })
      }),
    wipe: trpc.procedure
      .meta({
        description: 'Wipe the database - remove all tables, views etc.',
      })
      .mutation(async () => {
        return migrator.wipe({confirm})
      }),
  })

  return appRotuer
}

export const createMigratorCli = (migrator: Migrator) => {
  const confirm = async (sql: string) => {
    if (!sql.trim()) return false

    const result = await prompt({
      type: 'confirm',
      name: 'confirm',
      message: `Please confirm you want to run the following SQL:\n\n${sql}`,
    } as const)
    return (result as {confirm: boolean}).confirm
  }

  const appRouter = createMigratorRouter(migrator, {confirm})

  return trpcCli({router: appRouter})
}

if (require.main === module) {
  const migrator = new Migrator({
    client: createClient(`postgresql://postgres:postgres@localhost:5432/postgres`),
    migrationsPath: '/Users/mmkal/src/slonik-tools/packages/admin/zignoreme/migrator/migrations',
    migrationTableName: 'admin_test_migrations',
  })
  createMigratorCli(migrator).then(result => {
    if (result != null) console.log(result)
    process.exit()
  })
}

export class RepairAction extends CommandLineAction {
  private dryRunFlag?: CommandLineFlagParameter

  constructor(private readonly migrator: Migrator) {
    super({
      actionName: 'repair',
      summary: 'Repair hashes in the migration table',
      documentation:
        'If, for any reason, the hashes are incorrectly stored in the database, you can recompute them using this command.',
    })
  }

  protected onDefineParameters(): void {
    this.dryRunFlag = this.defineFlagParameter({
      parameterShortName: '-d',
      parameterLongName: '--dry-run',
      description: 'No changes are actually made',
    })
  }

  protected async onExecute(): Promise<void> {
    // await this.migrator.repair({dryRun: this.dryRunFlag.value})
  }
}

export class DefinitionsAction extends CommandLineAction {
  private sqlFileParameter: CommandLineStringParameter

  constructor(private readonly migrator: Migrator) {
    super({
      actionName: 'definitions',
      summary: 'Write SQL definitions for migrating a fresh database to the current state',
      documentation: 'Diffs the current database against a fresh one using migra, and writes SQL statements to stdout.',
    })
  }

  protected onDefineParameters(): void {
    this.sqlFileParameter = this.defineStringParameter({
      parameterLongName: '--output',
      parameterShortName: '-o',
      description: 'Path to the SQL file',
      argumentName: 'FILE',
      required: true,
    })
  }

  protected async onExecute(): Promise<void> {
    // await this.migrator.writeDefinitionFile(this.sqlFileParameter.value)
  }
}

export class DiffAction extends CommandLineAction {
  private sqlFileParameter?: CommandLineStringParameter

  constructor(readonly migrator: Migrator) {
    super({
      actionName: 'diff',
      summary: 'Add a migration file to match to the given SQL script',
      documentation: 'This command',
    })
  }

  protected onDefineParameters(): void {
    this.sqlFileParameter = this.defineStringParameter({
      parameterLongName: '--sql',
      description: 'Path to the SQL file',
      argumentName: 'FILE',
      required: true,
    })
  }

  protected async onExecute(): Promise<void> {
    // await this.migrator.diffCreate([this.sqlFileParameter.value])
  }
}

export interface RepairOptions {
  dryRun?: boolean
}
