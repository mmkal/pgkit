import {CommandLineAction, CommandLineFlagParameter, CommandLineStringParameter} from '@rushstack/ts-command-line'
import * as trpcServer from '@trpc/server'
import z from 'zod'
import {Migrator} from './migrator'
import {trpcCli} from './trpc-cli'

export const createMigratorRouter = (migrator: Migrator) => {
  const trpc = trpcServer.initTRPC.context().meta<{description: string}>().create({})

  const appRotuer = trpc.router({
    up: trpc.procedure
      .meta({description: 'Apply pending migrations'})
      .input(
        z.object({
          to: z.string().optional(),
        }),
      )
      .mutation(async ({ctx, input}) => {
        return migrator.up(input)
      }),
  })

  return appRotuer
}

export const createMigratorCli = (migrator: Migrator) => {
  const appRouter = createMigratorRouter(migrator)

  return trpcCli({router: appRouter})
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
