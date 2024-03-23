import {Client, Connection, Queryable, sql} from '@pgkit/client'
import * as umzug from 'umzug'
import {Logger} from './logging'

export interface MigratorContext {
  connection: Queryable
  sql: typeof sql
}

export type Migration = (params: umzug.MigrationParams<MigratorContext>) => Promise<unknown>
/**
 * Should either be a `Client` or `Connection`. If it has an `.end()`
 * method, the `.end()` method will be called after running the migrator as a CLI.
 */

export interface PGSuiteConnection extends Connection {
  end?: () => Promise<void>
}

export interface MigratorOptions {
  /**
   * Client instance for running migrations. You can import this from the same place as your main application,
   * or import another client instance with different permissions, security settings etc.
   */
  client: Client
  /**
   * Path to folder that will contain migration files.
   */
  migrationsPath: string
  /**
   * REQUIRED table name. The migrator will manage this table for you, but you have to tell it the name
   */
  migrationTableName: string | string[]
  /**
   * Logger with `info`, `warn`, `error` and `debug` methods - set explicitly to `undefined` to disable logging
   */
  logger?: Logger
}
/**
 * Narrowing of @see umzug.UmzugOptions where the migrations input type specifically, uses `glob`
 */

export type MigratorUmzugOptions = umzug.UmzugOptions<MigratorContext> & {
  migrations: umzug.GlobInputMigrations<MigratorContext>
}
export interface MigrationInfo {
  migration: string
  dbHash: string
  diskHash: string
}
