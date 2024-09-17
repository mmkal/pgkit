import {sql, Client, Queryable} from '@pgkit/client'
import {type Flags as MigraFlags} from '@pgkit/migra'
import * as umzug from 'umzug'

export interface MigratorContext {
  connection: Queryable
  sql: typeof sql
}

export type Migration = (params: umzug.MigrationParams<MigratorContext>) => Promise<void>

export type Confirm = (sql: string) => boolean | Promise<boolean>

export interface BaseListedMigration {
  name: string
  path: string
  content: string
  note?: string
}

export interface PendingMigration extends BaseListedMigration {
  status: 'pending'
}

export interface ExecutedMigration extends BaseListedMigration {
  status: 'executed'
  drifted: boolean
}

export type ListedMigration = PendingMigration | ExecutedMigration

export type RunnableMigration = umzug.RunnableMigration<MigratorContext>

export type Logger = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export type Task = <T>(name: string, fn: () => Promise<T>) => Promise<{result: T}>

export interface MigratorConfig {
  /** @pgkit/client instance */
  client: Client
  migrationsPath: string
  migrationTableName?: string | string[]
  /**
   * Whether to use `client.transaction(tx => ...)` or `client.connect(cn => ...)` when running up/down migrations
   * @default `transaction`
   */
  connectMethod?: 'transaction' | 'connect'

  /**
   * A function which wraps its callback, can be used to add logging before/after completion. Compatible with [tasuku](https://npmjs.com/package/tasuku), for example.
   * @example Using tasuku
   * ```ts
   * import task from 'tasuku'
   *
   * const migrator = new Migrator(___)
   *
   * migrator.useConfig({task}, async () => {
   *  await migrator.up()
   * })
   * ```
   *
   * @example Using a custom task function
   * ```ts
   * const migrator = new Migrator(___)
   *
   * migrator.useConfig({
   *    task: async (name, fn) => {
   *      migrator.logger.info('Starting', name)
   *      const result = await fn()
   *      migrator.logger.info('Finished', name)
   *      return {result}
   *    },
   *    async () => {
   *      await migrator.up()
   *    })
   * })
   * ```
   */
  task: Task
  logger: Logger

  defaultMigraOptions?: MigraFlags
}

export interface MigratorConstructorParams extends Omit<MigratorConfig, 'client' | 'task' | 'logger'> {
  client: string | Client
  task?: Task
  logger?: Logger
}
