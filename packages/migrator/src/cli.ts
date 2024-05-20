import * as prompt from '@inquirer/prompts'
import {createClient, sql} from '@pgkit/client'
import {CommandLineAction, CommandLineFlagParameter, CommandLineStringParameter} from '@rushstack/ts-command-line'
import * as trpcServer from '@trpc/server'
import * as colors from 'picocolors'
import tasuku from 'tasuku'
import z from 'zod'
import {Confirm, Migrator} from './migrator'
import {trpcCli} from './trpc-cli'

export const createMigratorRouter = (migrator: Migrator, {confirm}: {confirm: Confirm}) => {
  const trpc = trpcServer.initTRPC.context().meta<{description: string}>().create({})

  const appRotuer = trpc.router({
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
      .mutation(async ({input}) => {
        let query = input.query
        if (input.singlequote) query = query.replaceAll(input.singlequote, `'`)
        if (input.doublequote) query = query.replaceAll(input.doublequote, `"`)

        return migrator.client[input.method](sql.raw(query))
      }),
    up: trpc.procedure
      .meta({description: 'Apply pending migrations'})
      .input(
        z.union([
          z.object({to: z.string().optional(), step: z.undefined()}), //
          z.object({step: z.number(), to: z.undefined()}),
        ]),
      )
      .mutation(async ({input}) => {
        return migrator.up(input)
      }),
    baseline: trpc.procedure
      .meta({
        description:
          'Baseline the database at the specified migration. This forcibly edits the migrations table to mark all migrations up to this point as executed. Useful for introducing the migrator to an existing database.',
      })
      .input(
        z.object({
          to: z.string(),
          purgeDisk: z.boolean().optional(),
        }),
      )
      .mutation(async ({input}) => {
        return migrator.baseline({...input, to: input.to})
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
      .mutation(async ({input}) => {
        return migrator.rebase({...input, confirm})
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
          status: z.enum(['pending', 'executed']).optional(),
          result: z.enum(['first', 'last', 'one', 'maybeOne', 'all']).default('all'),
          output: z.enum(['name', 'path', 'content', 'object', 'json']).default('object'),
        }),
      )
      .query(async ({input}) => {
        const list = await migrator.list()
        const results = list
          .filter(m => {
            return m.name.includes(input.query || '') && m.status === (input.status || m.status)
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
    unlock: trpc.procedure
      .meta({
        description:
          'Release the advisory lock for this migrator on the database. This is useful if the migrator is stuck due to a previous crash',
      })
      .mutation(async () => {
        return migrator.unlock({confirm})
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
      .input(
        z.object({
          name: z.string().describe('Name of the migration to go to. Use "list" to see available migrations.'),
        }),
      )
      .mutation(async ({input}) => {
        return migrator.goto({name: input.name, confirm})
      }),
    wipe: trpc.procedure
      .meta({
        description: 'Wipe the database - remove all tables, views etc.',
      })
      .mutation(async () => {
        return migrator.wipe({confirm})
      }),
    ddl: trpc.procedure
      .meta({
        description: 'Sync the database with the definitions file',
      })
      .input(
        z.object({
          updateDb: z.boolean().optional().describe(`Update the database from the definitions file`),
          updateFile: z.boolean().optional().describe(`Update the definitions file from the database`),
        }),
      )
      .mutation(async ({input}) => {
        if (Boolean(input.updateDb) === Boolean(input.updateFile)) {
          throw new trpcServer.TRPCError({
            message: `You must specify exactly one of updateDb or updateFile (got ${JSON.stringify(input)})`,
            code: 'BAD_REQUEST',
          })
        }
        // eslint-disable-next-line unicorn/prefer-ternary
        if (input.updateDb) {
          return migrator.updateDBFromDDL({confirm})
        } else {
          return migrator.updateDDLFromDB()
        }
      }),
  })

  return appRotuer
}

export const createMigratorCli = (migrator: Migrator) => {
  const confirm = async (input: string) => {
    if (!input.trim()) return false

    return prompt.confirm({
      message: `${colors.underline('Please confirm you want to run the following')}:\n\n${input}`,
    })
  }

  const router = createMigratorRouter(migrator, {confirm})

  return migrator.configStorage.run(
    {task: tasuku}, // use tasuku for logging
    async () => trpcCli({router}),
  )
}

if (require.main === module) {
  const vars = {
    PGKIT_CLIENT: 'postgresql://postgres:postgres@localhost:5432/postgres',
    PGKIT_MIGRATIONS_PATH: process.cwd() + 'migrations/scripts',
    PGKIT_MIGRATIONS_TABLE_NAME: undefined as string | undefined,
    ...(process.env as {}),
  }
  const migrator = new Migrator({
    client: createClient(vars.PGKIT_CLIENT),
    migrationsPath: vars.PGKIT_MIGRATIONS_PATH,
    migrationTableName: vars.PGKIT_MIGRATIONS_TABLE_NAME,
  })

  // eslint-disable-next-line unicorn/prefer-top-level-await
  void createMigratorCli(migrator).then(result => {
    if (result != null) migrator.logger.info(result)
    // eslint-disable-next-line unicorn/no-process-exit
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
  // private sqlFileParameter: CommandLineStringParameter

  constructor(private readonly migrator: Migrator) {
    super({
      actionName: 'definitions',
      summary: 'Write SQL definitions for migrating a fresh database to the current state',
      documentation: 'Diffs the current database against a fresh one using migra, and writes SQL statements to stdout.',
    })
  }

  protected onDefineParameters(): void {
    // this.sqlFileParameter = this.defineStringParameter({
    //   parameterLongName: '--output',
    //   parameterShortName: '-o',
    //   description: 'Path to the SQL file',
    //   argumentName: 'FILE',
    //   required: true,
    // })
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
