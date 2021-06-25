import {createHash} from 'crypto'
import {readFileSync} from 'fs'
import {basename, dirname, join} from 'path'
import * as umzug from 'umzug'
import {sql, DatabaseTransactionConnectionType, DatabasePoolConnectionType, DatabasePoolType} from 'slonik'
import * as path from 'path'
import * as templates from './templates'

interface SlonikMigratorContext {
  parent: DatabasePoolType
  connection: DatabaseTransactionConnectionType
  sql: typeof sql
  commit: () => Promise<void>
}

export class SlonikMigrator extends umzug.Umzug<SlonikMigratorContext> {
  constructor(
    private slonikMigratorOptions: {
      slonik: DatabasePoolType
      migrationsPath: string
      migrationTableName: string | string[]
      logger: umzug.UmzugOptions['logger']
      singleTransaction?: true
    },
  ) {
    super({
      context: () => ({
        parent: slonikMigratorOptions.slonik,
        sql,
        commit: null as never, // commit function is added later by storage setup.
        connection: null as never, // commit function is added later by storage setup.
      }),
      migrations: () => ({
        glob: [this.migrationsGlob(), {cwd: path.resolve(slonikMigratorOptions.migrationsPath)}],
        resolve: params => this.resolver(params),
      }),
      storage: {
        executed: (...args) => this.executedNames(...args),
        logMigration: (...args) => this.logMigration(...args),
        unlogMigration: (...args) => this.unlogMigration(...args),
      },
      logger: slonikMigratorOptions.logger,
      create: {
        template: filepath => this.template(filepath),
        folder: path.resolve(slonikMigratorOptions.migrationsPath),
      },
    })

    if ('mainModule' in slonikMigratorOptions) {
      throw new Error(`Using \`mainModule\` is deprecated. Use \`migrator.runAsCLI()\` instead.`)
    }

    if (!slonikMigratorOptions.migrationTableName) {
      throw new Error(
        `@slonik/migrator: Relying on the default migration table name is deprecated. You should set this explicitly to 'migration' if you've used a prior version of this library.`,
      )
    }

    this.on('beforeCommand', ev => this.setup(ev))
    this.on('afterCommand', ev => this.teardown(ev))
  }

  getCli(options?: umzug.CommandLineParserOptions) {
    return super.getCli({toolDescription: `@slonik/migrator - PostgreSQL migration tool`, ...options})
  }

  async runAsCLI(argv?: string[]) {
    const result = await super.runAsCLI(argv)
    await this.slonikMigratorOptions.slonik.end?.()
    return result
  }

  /** Glob pattern with `migrationsPath` as `cwd`. Could be overridden to support nested directories */
  protected migrationsGlob() {
    return './*.{js,ts,sql}'
  }

  /** Gets a hexadecimal integer to pass to postgres's `select pg_advisory_lock()` function */
  protected advisoryLockId() {
    const hashable = '@slonik/migrator advisory lock:' + JSON.stringify(this.slonikMigratorOptions.migrationTableName)
    const hex = createHash('md5').update(hashable).digest('hex').slice(0, 8)
    return parseInt(hex, 16)
  }

  protected migrationTableNameIdentifier() {
    const table = this.slonikMigratorOptions.migrationTableName
    return sql.identifier(Array.isArray(table) ? table : [table])
  }

  protected template(filepath: string): Array<[string, string]> {
    if (filepath.endsWith('.ts')) {
      return [[filepath, templates.typescript]]
    }
    if (filepath.endsWith('.js')) {
      return [[filepath, templates.javascript]]
    }
    const downPath = path.join(path.dirname(filepath), 'down', path.basename(filepath))
    return [
      [filepath, templates.sqlUp],
      [downPath, templates.sqlDown],
    ]
  }

  protected resolver(
    params: umzug.MigrationParams<SlonikMigratorContext>,
  ): umzug.RunnableMigration<SlonikMigratorContext> {
    if (path.extname(params.name) === '.sql') {
      return {
        name: params.name,
        path: params.path,
        up: async ({path, context}) => {
          await context!.connection.query(rawQuery(readFileSync(path!, 'utf8')))
        },
        down: async ({path, context}) => {
          const downPath = join(dirname(path!), 'down', basename(path!))
          await context!.connection.query(rawQuery(readFileSync(downPath, 'utf8')))
        },
      }
    }
    const {connection: slonik} = params.context
    const migrationModule: {up: Migration; down?: Migration} = require(params.path!)
    return {
      name: params.name,
      path: params.path,
      up: async upParams => migrationModule.up({slonik, sql, ...upParams}),
      down: async downParams => migrationModule.down?.({slonik, sql, ...downParams}),
    }
  }

  protected getOrCreateMigrationsTable(context: SlonikMigratorContext) {
    return context.parent.query(sql`
      create table if not exists ${this.migrationTableNameIdentifier()}(
        name text primary key,
        hash text not null,
        date timestamptz not null default now()
      )
    `)
  }

  protected async setup({context}: {context: SlonikMigratorContext}) {
    let settle!: Function
    const settledPromise = new Promise(resolve => (settle = resolve))

    let ready!: Function
    const readyPromise = new Promise(r => (ready = r))

    const connect = this.slonikMigratorOptions.singleTransaction ? context.parent.transaction : context.parent.connect
    const connectionPromise = connect(async connection => {
      context.connection = connection
      ready()

      await settledPromise
    })

    await readyPromise

    context.commit = () => {
      settle()
      return connectionPromise
    }

    const logger = this.slonikMigratorOptions.logger

    try {
      const timeout = setTimeout(() => logger?.info({message: `Waiting for lock...`} as any), 1000)
      await context.connection.any(context.sql`select pg_advisory_lock(${this.advisoryLockId()})`)
      clearTimeout(timeout)

      await this.getOrCreateMigrationsTable(context)
    } catch (e) {
      await context.commit()
      throw e
    }
  }

  protected async teardown({context}: {context: SlonikMigratorContext}) {
    await context.connection.query(context.sql`select pg_advisory_unlock(${this.advisoryLockId()})`).catch(error => {
      this.slonikMigratorOptions.logger?.error({
        message: `Failed to unlock. This is expected if the lock acquisition timed out.`,
        originalError: error,
      })
    })
    await context.commit()
    context.connection = null as never
  }

  protected hash(name: string) {
    return name
  }

  protected async executedNames({context}: {context: SlonikMigratorContext}) {
    await this.getOrCreateMigrationsTable(context)
    const results = await context.parent
      .any(sql`select name, hash from ${this.migrationTableNameIdentifier()}`)
      .then(migrations =>
        migrations.map(r => {
          const name = r.name as string
          /* istanbul ignore if */
          if (r.hash !== this.hash(name)) {
            this.slonikMigratorOptions.logger?.warn({
              message: `hash in '${this.slonikMigratorOptions.migrationTableName}' table didn't match content on disk.`,
              question: `did you try to change a migration file after it had been run?`,
              migration: r.name,
              dbHash: r.hash,
              diskHash: this.hash(name),
            })
          }
          return name
        }),
      )

    return results
  }

  protected async logMigration({name, context}: {name: string; context: SlonikMigratorContext}) {
    await context.connection.query(sql`
      insert into ${this.migrationTableNameIdentifier()}(name, hash)
      values (${name}, ${this.hash(name)})
    `)
  }

  protected async unlogMigration({name, context}: {name: string; context: SlonikMigratorContext}) {
    await context.connection.query(sql`
      delete from ${this.migrationTableNameIdentifier()}
      where name = ${name}
    `)
  }
}

export type Migration = (
  params: umzug.MigrationParams<SlonikMigratorContext> & {
    /** @deprecated use `context.connection` */
    slonik: DatabaseTransactionConnectionType
    /** @deprecated use `context.sql` */
    sql: typeof sql
  },
) => Promise<unknown>

/**
 * Should either be a `DatabasePoolType` or `DatabasePoolConnectionType`. If it's a `DatabasePoolType` with an `.end()`
 * method, the `.end()` method will be called after running the migrator as a CLI.
 */
export interface SlonikConnectionType extends DatabasePoolConnectionType {
  end?: () => Promise<void>
}

export interface SlonikMigratorOptions {
  /**
   * Slonik instance for running migrations. You can import this from the same place as your main application,
   * or import another slonik instance with different permissions, security settings etc.
   */
  slonik: DatabasePoolType
  /**
   * Path to folder that will contain migration files.
   */
  migrationsPath: string
  /**
   * REQUIRED table name. @slonik/migrator will manage this table for you, but you have to tell it the name
   * Note: prior to version 0.6.0 this had a default value of "migration", so if you're upgrading from that
   * version, you should name it that!
   */
  migrationTableName: string | string[]
  /**
   * Logger with `info`, `warn`, `error` and `debug` methods - set explicitly to `undefined` to disable logging
   */
  logger: umzug.UmzugOptions['logger']
}

/**
 * More reliable than slonik-sql-tag-raw: https://github.com/gajus/slonik-sql-tag-raw/issues/6
 * But doesn't sanitise any inputs, so shouldn't be used with templates
 */
const rawQuery = (query: string): ReturnType<typeof sql> => ({
  type: 'SLONIK_TOKEN_SQL',
  sql: query,
  values: [],
})

/**
 * Narrowing of @see umzug.UmzugOptions where the migrations input type specifically, uses `glob`
 */
export type SlonikUmzugOptions = umzug.UmzugOptions<SlonikMigratorContext> & {
  migrations: umzug.GlobInputMigrations<SlonikMigratorContext>
}

/**
 * @deprecated use `new SlonikMigrator(...)` which takes the same options.
 *
 * Note: `mainModule` is not passed into `new SlonikMigrator(...)`. To get the same functionality, use `.runAsCLI()`
 *
 * @example
 * ```
 * const migrator = new SlonikMigrator(...)
 *
 * if (require.main === module) {
 *  migrator.runAsCLI()
 * }
 * ```
 */
export const setupSlonikMigrator = (
  options: SlonikMigratorOptions & {
    /**
     * @deprecated Use `.runAsCLI()`, e.g. `if (require.main === module) migrator.runAsCLI()`
     *
     * ~OPTIONAL "module" value. If you set `mainModule: module` in a nodejs script, that script will become a
     * runnable CLI when invoked directly, but the migrator object can still be imported as normal if a different
     * entrypoint is used.~
     */
    mainModule?: NodeModule
    reasonForUsingDeprecatedAPI: 'Back-compat' | 'Testing' | `Life's too short` | 'Other'
  },
) => {
  console.warn(
    `@slonik/migrator: Use of ${setupSlonikMigrator.name} is deprecated. Use \`new SlonikMigrator(...)\` which takes the same options instead`,
  )
  const defaultMigrationTableName = () => {
    console.warn(
      `Relying on the default migration table name is deprecated. You should set this explicitly to 'migration'`,
    )
    return 'migration'
  }
  const migrator = new SlonikMigrator({
    slonik: options.slonik,
    migrationsPath: options.migrationsPath,
    migrationTableName: options.migrationTableName || defaultMigrationTableName(),
    logger: options.logger,
  })
  if (options.mainModule === require.main) {
    console.warn(`Using \`mainModule\` is deprecated. Use \`migrator.runAsCLI()\` instead.`)
    migrator.runAsCLI()
  }
  return migrator
}
