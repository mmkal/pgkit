import * as prompt from '@inquirer/prompts'
import {CommandLineAction, CommandLineFlagParameter, CommandLineStringParameter} from '@rushstack/ts-command-line'
import * as path from 'path'
import * as colors from 'picocolors'
import tasuku from 'tasuku'
import {Migrator} from './migrator'
import {migratorTrpc, createMigratorRouter} from './router'
import {trpcCli} from './trpc-cli'

export const createMigratorCli = (migrator: Migrator) => {
  const confirm = async (input: string) => {
    if (!input.trim()) return false

    return prompt.confirm({
      message: `${colors.underline('Please confirm you want to run the following')}:\n\n${input}`,
    })
  }

  const router = createMigratorRouter(migratorTrpc)

  return migrator.configStorage.run(
    {task: tasuku}, // use tasuku for logging
    async () => {
      await trpcCli({
        router,
        context: {migrator, confirm},
      })
    },
  )
}

if (require.main === module) {
  const migrator = new Migrator({
    client: process.env.PGKIT_CLIENT || 'postgresql://postgres:postgres@localhost:5432/postgres',
    migrationsPath: process.env.PGKIT_MIGRATIONS_PATH || path.join(process.cwd(), 'migrations'),
    migrationTableName: process.env.PGKIT_MIGRATIONS_TABLE_NAME,
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
