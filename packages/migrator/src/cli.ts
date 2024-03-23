import {CommandLineAction, CommandLineFlagParameter, CommandLineStringParameter} from '@rushstack/ts-command-line'
import {Migrator} from './migrator'

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
    await this.migrator.repair({dryRun: this.dryRunFlag.value})
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
    await this.migrator.diffCreate([this.sqlFileParameter.value])
  }
}

export interface RepairOptions {
  dryRun?: boolean
}
