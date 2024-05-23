import * as prompt from '@inquirer/prompts'
import * as path from 'path'
import * as colors from 'picocolors'
import {trpcCli} from 'trpc-cli'
import {Migrator} from './migrator'
import {createMigratorRouter} from './router'

export const getMigratorFromEnv = () => {
  return new Migrator({
    client: process.env.PGKIT_CONNECTION_STRING || 'postgresql://postgres:postgres@localhost:5432/postgres',
    migrationsPath: process.env.PGKIT_MIGRATIONS_PATH || path.join(process.cwd(), 'migrations'),
    migrationTableName: process.env.PGKIT_MIGRATIONS_TABLE_NAME,
  })
}

export const createMigratorCli = (migrator: Migrator) => {
  return trpcCli({
    router: createMigratorRouter(),
    context: {migrator, confirm},
  })
}

export type MigratorCLI = ReturnType<typeof createMigratorCli>

export const confirm = async (input: string) => {
  if (!input.trim()) return false

  const message = `${colors.underline('Please confirm you want to run the following')}:\n\n${input}`
  return prompt.confirm({message})
}
