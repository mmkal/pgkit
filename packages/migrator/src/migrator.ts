import {sql, Client, Connection, Queryable, nameQuery, createClient} from '@pgkit/client'
import * as migra from '@pgkit/migra'
import {Flags} from '@pgkit/migra'
import {CommandLineAction, CommandLineFlagParameter, CommandLineStringParameter} from '@rushstack/ts-command-line'
import {createHash} from 'crypto'
import {readFileSync} from 'fs'
import {writeFile, readFile} from 'fs/promises'
import * as p from 'path'
import * as umzug from 'umzug'
import * as templates from './templates'

interface MigratorContext {
  connection: Queryable
  sql: typeof sql
}

export class Migrator extends umzug.Umzug<MigratorContext> {
  constructor(
    readonly migratorOptions: {
      /** @pgkit/client instance */
      client: Client
      migrationsPath: string
      migrationTableName: string | string[]
      /**
       * instance for logging info/warnings/errors for various commands.
       * @default `Migrator.prettyLogger` - logs to console with minor "prettifying"
       */
      logger?: umzug.UmzugOptions['logger']
      /**
       * Whether to use `client.transaction(tx => ...)` or `client.connect(cn => ...)` when running up/down migrations
       * @default `transaction`
       */
      connectMethod?: 'transaction' | 'connect'
    },
  ) {
    super({
      context: () => ({
        sql,
        connection: migratorOptions.client,
      }),
      migrations: () => ({
        glob: [this.migrationsGlob(), {cwd: p.resolve(migratorOptions.migrationsPath)}],
        resolve: params => this.resolver(params),
      }),
      storage: {
        executed: async () => this.executedNames(),
        logMigration: async (...args) => this.logMigration(...args),
        unlogMigration: async (...args) => this.unlogMigration(...args),
      },
      logger: migratorOptions.logger || Migrator.prettyLogger,
      create: {
        template: filepath => this.template(filepath),
        folder: p.resolve(migratorOptions.migrationsPath),
      },
    })
  }

  get logger() {
    return this.migratorOptions.logger || Migrator.prettyLogger
  }

  async up(options?: Parameters<umzug.Umzug<MigratorContext>['up']>[0]) {
    try {
      return await super.up(options)
    } catch (err) {
      let e = err
      while (e?.cause?.message) {
        e = e.cause
      }

      throw Object.assign(new Error(`up migration failed: ${err.message}`), {stack: err.stack})
    }
  }

  /**
   * Logs messages to console. Known events are prettified to strings, unknown
   * events or unexpected message properties in known events are logged as objects.
   */
  static prettyLogger: NonNullable<MigratorOptions['logger']> = {
    info: message => prettifyAndLog('info', message),
    warn: message => prettifyAndLog('warn', message),
    error: message => prettifyAndLog('error', message),
    debug: message => prettifyAndLog('debug', message),
  }

  getCli(options?: umzug.CommandLineParserOptions) {
    const cli = super.getCli({toolDescription: `@pgkit/migrator - PostgreSQL migration tool`, ...options})
    cli.addAction(new RepairAction(this))
    cli.addAction(new DiffAction(this))
    return cli
  }

  async runAsCLI(argv?: string[]) {
    const result = await super.runAsCLI(argv)
    await this.migratorOptions.client.pgp.$pool.end?.()
    return result
  }

  /** Glob pattern with `migrationsPath` as `cwd`. Could be overridden to support nested directories */
  protected migrationsGlob() {
    return './*.{sql,js,ts,cjs,mjs}'
  }

  /** Gets a hexadecimal integer to pass to postgres's `select pg_advisory_lock()` function */
  protected advisoryLockId() {
    const hashable = '@pgkit/migrator advisory lock:' + JSON.stringify(this.migratorOptions.migrationTableName)
    const hex = createHash('md5').update(hashable).digest('hex').slice(0, 8)
    return Number.parseInt(hex, 16)
  }

  protected migrationTableNameIdentifier() {
    const table = this.migratorOptions.migrationTableName
    return sql.identifier(Array.isArray(table) ? table : [table])
  }

  protected template(filepath: string): Array<[string, string]> {
    if (filepath.endsWith('.ts')) {
      return [[filepath, templates.typescript]]
    }

    if (filepath.endsWith('.js') || filepath.endsWith('.cjs')) {
      return [[filepath, templates.cjs]]
    }

    if (filepath.endsWith('.mjs')) {
      return [[filepath, templates.esm]]
    }

    const downPath = p.join(p.dirname(filepath), 'down', p.basename(filepath))
    return [
      [filepath, templates.sqlUp],
      [downPath, templates.sqlDown],
    ]
  }

  protected resolver(params: umzug.MigrationParams<MigratorContext>): umzug.RunnableMigration<MigratorContext> {
    if (p.extname(params.name) === '.sql') {
      return {
        name: params.name,
        path: params.path,
        async up({path, context}) {
          await context.connection.query(sql.raw(readFileSync(path, 'utf8')))
        },
        async down({path, context}) {
          const downPath = p.join(p.dirname(path), 'down', p.basename(path))
          await context.connection.query(sql.raw(readFileSync(downPath, 'utf8')))
        },
      }
    }

    const migrationModule: () => Promise<{up: Migration; down?: Migration}> = async () => import(params.path)
    return {
      name: params.name,
      path: params.path,
      up: async upParams => migrationModule().then(async m => m.up(upParams)),
      down: async downParams => migrationModule().then(async m => m.down?.(downParams)),
    }
  }

  // todo: use migra to make sure the table has the right definition?
  protected async getOrCreateMigrationsTable() {
    await Migrator.getOrCreateMigrationsTable({client: this.client, table: this.migrationTableNameIdentifier()})
  }

  static async getOrCreateMigrationsTable(params: {client: Client; table: ReturnType<typeof sql.identifier>}) {
    await params.client.query(sql`
      create table if not exists ${params.table}(
        name text primary key,
        hash text not null,
        date timestamptz not null default now()
      )
    `)
  }

  /** Wait this many milliseconds before logging a message warning that the advisory lock hasn't been acquired yet. */
  lockWarningMs = 1000

  get client() {
    return this.migratorOptions.client
  }

  async connect<T>(fn: (connection: Connection) => Promise<T>) {
    const {connectMethod = 'transaction'} = this.migratorOptions
    return this.client[connectMethod](fn)
  }

  async waitForAdvisoryLock() {
    const start = Date.now()
    const timeout = setTimeout(() => {
      const message = `Waiting for lock. This may mean another process is simultaneously running migrations. You may want to issue a command like "set lock_timeout = '10s'" if this happens frequently. Othrewise, this command may wait until the process is killed.`
      this.logger.warn({message})
    }, this.lockWarningMs)
    await this.client.any(sql`select pg_advisory_lock(${this.advisoryLockId()})`)
    clearTimeout(timeout)
    return {took: Date.now() - start}
  }

  async releaseAdvisoryLock() {
    await this.client.any(sql`select pg_advisory_unlock(${this.advisoryLockId()})`).catch(error => {
      this.logger.error({
        message: `Failed to unlock. This is expected if the lock acquisition timed out. Otherwise, you may need to run "select pg_advisory_unlock(${this.advisoryLockId()})" manually`,
        originalError: error,
      })
    })
  }

  async runCommand<T>(command: string, cb: (params: {context: MigratorContext}) => Promise<T>) {
    let run = cb
    if (command === 'up' || command === 'down') {
      run = async ({context}) => {
        try {
          await this.waitForAdvisoryLock()
          return await this.connect(async conn => cb({context: {...context, connection: conn}}))
        } finally {
          await this.releaseAdvisoryLock()
        }
      }
    }

    return super.runCommand(command, async ({context}) => {
      await this.getOrCreateMigrationsTable()
      return run({context})
    })
  }

  async repair(options?: RepairOptions) {
    const dryRun = options?.dryRun ?? false

    await this.runCommand('repair', async ({context}) => {
      const infos = await this.executedInfos()
      const migrationsThatNeedRepair = infos.filter(({dbHash, diskHash}) => dbHash !== diskHash)

      if (migrationsThatNeedRepair.length === 0) {
        this.logger.info({message: 'Nothing to repair'})
        return
      }

      for (const {migration, dbHash, diskHash} of migrationsThatNeedRepair) {
        this.logger.warn({
          message: `Repairing migration ${migration}`,
          migration,
          oldHash: dbHash,
          newHash: diskHash,
          dryRun,
        })

        if (!dryRun) await this.repairMigration({name: migration, hash: diskHash, context})
      }
    })
  }

  protected hash(name: string) {
    return createHash('md5')
      .update(readFileSync(p.join(this.migratorOptions.migrationsPath, name), 'utf8').trim().replaceAll(/\s+/g, ' '))
      .digest('hex')
      .slice(0, 10)
  }

  get tableName() {
    return [this.migratorOptions.migrationTableName].flat().join('.')
  }

  protected async executedNames() {
    const infos = await this.executedInfos()

    infos
      .filter(({dbHash, diskHash}) => dbHash !== diskHash)
      .forEach(({migration, dbHash, diskHash}) => {
        this.logger.warn({
          message: `hash in '${this.tableName}' table didn't match content on disk.`,
          question: `Did you try to change a migration file after it had been run? You might need to run the 'repair' command.`,
          migration,
          dbHash,
          diskHash,
        })
      })

    return infos.map(({migration}) => migration)
  }

  /**
   * Returns the name, dbHash and diskHash for each executed migration.
   */
  private async executedInfos(): Promise<MigrationInfo[]> {
    await this.getOrCreateMigrationsTable()
    const migrations = await this.client.any(sql`select name, hash from ${this.migrationTableNameIdentifier()}`)

    return migrations.map(r => {
      const name = r.name as string
      return {
        migration: name,
        dbHash: r.hash as string,
        diskHash: this.hash(name),
      }
    })
  }

  protected async logMigration({name, context}: {name: string; context: MigratorContext}) {
    await context.connection.query(sql`
      insert into ${this.migrationTableNameIdentifier()}(name, hash)
      values (${name}, ${this.hash(name)})
    `)
  }

  protected async unlogMigration({name, context}: {name: string; context: MigratorContext}) {
    await context.connection.query(sql`
      delete from ${this.migrationTableNameIdentifier()}
      where name = ${name}
    `)
  }

  protected async repairMigration({name, hash, context}: {name: string; hash: string; context: MigratorContext}) {
    await context.connection.query(sql`
      update ${this.migrationTableNameIdentifier()}
      set hash = ${hash}
      where name = ${name}
    `)
  }

  /**
   * Given a list of SQL definition files (typically `create table ...; create index ...` type statements), this will create
   * a new migration would bring the database to the state described by the SQL files.
   * Note that the created migration should always be reviewed before running it in production.
   */
  async diffCreate(
    sqlFiles: string[],
    {migraOptions = {} as Flags, createOptions = {} as Omit<Parameters<Migrator['create']>[0], 'content'>} = {},
  ) {
    const pending = await this.pending()
    if (pending.length > 0) {
      throw new Error(`There are pending migrations. Run them before creating a diff migration.`, {cause: pending})
    }

    const shadowDb = `shadow_${Math.random().toString(36).slice(2)}`
    // eslint-disable-next-line mmkal/@typescript-eslint/no-base-to-string
    const shadowConnectionString = this.client.pgp.$cn.toString().replace(/\w+$/, shadowDb)
    const shadowClient = createClient(shadowConnectionString, {
      pgpOptions: this.client.pgpOptions,
    })
    this.logger.info({message: `Creating shadow database ${shadowDb}`})
    await this.client.query(sql`create database ${sql.identifier([shadowDb])}`)
    await Migrator.getOrCreateMigrationsTable({client: shadowClient, table: this.migrationTableNameIdentifier()})
    try {
      for (const file of sqlFiles) {
        this.logger.info({message: `Running ${file} in shadow database`})
        const query = await readFile(file)
        await shadowClient.query(sql.raw(query.toString()))
      }

      this.logger.info({message: `Running migra to generate diff migration`})
      const {sql: content} = await migra.run(this.client.connectionString(), shadowConnectionString, {
        unsafe: true,
        ...migraOptions,
      })

      await this.create({
        name: nameQuery([content]) + '.sql',
        ...createOptions,
        content,
      })
    } finally {
      await shadowClient.end()
      // todo: figure out why this times out. Until then, just leave the shadow db around :Z
      // await params.client.query(sql`drop database ${sql.identifier([shadowDb])}`)
    }
  }

  async writeDefinitionFile(filepath: string) {
    const pending = await this.pending()
    if (pending.length > 0) {
      throw new Error(`There are pending migrations. Run them before creating a definition file.`, {cause: pending})
    }

    const shadowDb = `shadow_${Math.random().toString(36).slice(2)}`
    // eslint-disable-next-line mmkal/@typescript-eslint/no-base-to-string
    const shadowConnectionString = this.client.pgp.$cn.toString().replace(/\w+$/, shadowDb)
    const shadowClient = createClient(shadowConnectionString, {
      pgpOptions: this.client.pgpOptions,
    })

    try {
      this.logger.info({message: `Creating shadow database ${shadowDb}`})
      await this.client.query(sql`create database ${sql.identifier([shadowDb])}`)
      await Migrator.getOrCreateMigrationsTable({client: shadowClient, table: this.migrationTableNameIdentifier()})

      const {sql: content} = await migra.run(shadowClient.connectionString(), this.client.connectionString(), {})

      await writeFile(filepath, content)
    } finally {
      await shadowClient.end()
    }
  }
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
  logger: umzug.UmzugOptions['logger']
}

/**
 * Narrowing of @see umzug.UmzugOptions where the migrations input type specifically, uses `glob`
 */
export type MigratorUmzugOptions = umzug.UmzugOptions<MigratorContext> & {
  migrations: umzug.GlobInputMigrations<MigratorContext>
}

interface MigrationInfo {
  migration: string
  dbHash: string
  diskHash: string
}

class RepairAction extends CommandLineAction {
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

class DiffAction extends CommandLineAction {
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

type LogMessage = Record<string, unknown>

const createMessageFormats = <T extends Record<string, (msg: LogMessage) => [string, LogMessage]>>(formats: T) =>
  formats

/* eslint-disable mmkal/@typescript-eslint/restrict-template-expressions */
/* eslint-disable mmkal/@typescript-eslint/no-base-to-string */
const MESSAGE_FORMATS = createMessageFormats({
  created(msg) {
    const {event, path, ...rest} = msg
    return [`created   ${path}`, rest]
  },
  migrating(msg) {
    const {event, name, ...rest} = msg
    return [`migrating ${name}`, rest]
  },
  migrated(msg) {
    const {event, name, durationSeconds, ...rest} = msg
    return [`migrated  ${name} in ${durationSeconds} s`, rest]
  },
  reverting(msg) {
    const {event, name, ...rest} = msg
    return [`reverting ${name}`, rest]
  },
  reverted(msg) {
    const {event, name, durationSeconds, ...rest} = msg
    return [`reverted  ${name} in ${durationSeconds} s`, rest]
  },
  up(msg) {
    const {event, message, ...rest} = msg
    return [`up migration completed, ${message}`, rest]
  },
  down(msg) {
    const {event, message, ...rest} = msg
    return [`down migration completed, ${message}`, rest]
  },
})

function isProperEvent(event: unknown): event is keyof typeof MESSAGE_FORMATS {
  return typeof event === 'string' && event in MESSAGE_FORMATS
}
/* eslint-enable mmkal/@typescript-eslint/restrict-template-expressions */

function prettifyAndLog(level: keyof typeof Migrator.prettyLogger, message: LogMessage) {
  const {event} = message || {}
  /* eslint-disable no-console */
  // eslint-disable-next-line mmkal/@typescript-eslint/no-confusing-void-expression
  if (!isProperEvent(event)) return console[level](message)

  const [messageStr, rest] = MESSAGE_FORMATS[event](message)
  console[level](messageStr)

  if (Object.keys(rest).length > 0) console[level](rest)
}
