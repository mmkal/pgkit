import {sql, Client, Connection, nameQuery, createClient} from '@pgkit/client'
import {type Flags} from '@pgkit/migra'
import * as migra from '@pgkit/migra'
import {createHash} from 'crypto'
import {readFileSync} from 'fs'
import {writeFile, readFile} from 'fs/promises'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as umzug from 'umzug'
import {RepairAction, DiffAction, RepairOptions, DefinitionsAction} from './cli'
import {Logger, prettifyAndLog} from './logging'
import * as templates from './templates'
import {Migration, MigrationInfo, MigratorContext} from './types'

export type Confirm = (sql: string) => boolean
export interface BaseListedMigration {
  name: string
  path: string
}
export interface PendingMigration extends BaseListedMigration {
  status: 'pending'
}
export interface ExecutedMigration extends BaseListedMigration {
  status: 'executed'
}
export type ListedMigration = PendingMigration | ExecutedMigration

export interface MigratorOptions {
  /** @pgkit/client instance */
  client: Client
  migrationsPath: string
  migrationTableName: string | string[]
  definitionsFile?: string
  /**
   * instance for logging info/warnings/errors for various commands.
   * @default `Migrator.prettyLogger` - logs to console with minor "prettifying"
   */
  logger?: Logger
  /**
   * Whether to use `client.transaction(tx => ...)` or `client.connect(cn => ...)` when running up/down migrations
   * @default `transaction`
   */
  connectMethod?: 'transaction' | 'connect'
}

export class Migrator {
  constructor(readonly migratorOptions: MigratorOptions) {
    // super({
    //   context: () => ({
    //     sql,
    //     connection: migratorOptions.client,
    //   }),
    //   migrations: () => ({
    //     glob: [this.migrationsGlob(), {cwd: path.resolve(migratorOptions.migrationsPath)}],
    //     resolve: params => this.resolver(params),
    //   }),
    //   storage: {
    //     executed: async () => this.executedNames(),
    //     logMigration: async (...args) => this.logMigration(...args),
    //     unlogMigration: async (...args) => this.unlogMigration(...args),
    //   },
    //   logger: migratorOptions.logger || Migrator.prettyLogger,
    //   create: {
    //     template: filepath => this.template(filepath),
    //     folder: path.resolve(migratorOptions.migrationsPath),
    //   },
    // })
  }

  // get logger() {
  //   return this.migratorOptions.logger || Migrator.prettyLogger
  // }

  // async up(options?: Parameters<umzug.Umzug<MigratorContext>['up']>[0]) {
  //   try {
  //     return await super.up(options)
  //   } catch (err) {
  //     throw Object.assign(new Error(`up migration failed: ${err.message}`), {stack: err.stack as string})
  //   }
  // }

  // getCli(options?: umzug.CommandLineParserOptions) {
  //   const cli = super.getCli({toolDescription: `@pgkit/migrator - PostgreSQL migration tool`, ...options})
  //   cli.addAction(new RepairAction(this))
  //   cli.addAction(new DiffAction(this))
  //   cli.addAction(new DefinitionsAction(this))
  //   return cli
  // }

  // async runAsCLI(argv?: string[]) {
  //   const result = await super.runAsCLI(argv)
  //   await this.migratorOptions.client?.end?.()
  //   return result
  // }

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

    return [[filepath, templates.sqlUp]]
  }

  // downPath(filepath: string) {
  //   return path.join(path.dirname(filepath), 'down', path.basename(filepath))
  // }

  protected async applyMigration(params: {name: string; path: string; context: MigratorContext}) {
    if (!params.path.endsWith('.sql')) {
      throw new Error(`Only SQL migrations are supported. Got ${params.path}`)
    }

    const content = await readFile(params.path, 'utf8')
    await params.context.connection.query(sql.raw(content))
  }

  // protected resolver(params: umzug.MigrationParams<MigratorContext>): umzug.RunnableMigration<MigratorContext> {
  //   if (p.extname(params.name) === '.sql') {
  //     return {
  //       name: params.name,
  //       path: params.path,
  //       up: async ({path, context}) => {
  //         await context.connection.query(sql.raw(readFileSync(path, 'utf8')))
  //       },
  //       down: async ({path, context}) => {
  //         const downPath = this.downPath(path)
  //         await context.connection.query(sql.raw(readFileSync(downPath, 'utf8')))
  //       },
  //     }
  //   }

  //   const migrationModule: () => Promise<{up: Migration; down?: Migration}> = async () => import(params.path)
  //   return {
  //     name: params.name,
  //     path: params.path,
  //     up: async upParams => migrationModule().then(async m => m.up(upParams)),
  //     down: async downParams => migrationModule().then(async m => m.down?.(downParams)),
  //   }
  // }

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

  get definitionsFile() {
    return path.join(this.migratorOptions.migrationsPath, '../definitions.sql')
  }

  async connect<T>(fn: (connection: Connection) => Promise<T>) {
    const {connectMethod = 'transaction'} = this.migratorOptions
    return this.client[connectMethod](fn)
  }

  async waitForAdvisoryLock() {
    const start = Date.now()
    const timeout = setTimeout(() => {
      const message = `Waiting for lock. This may mean another process is simultaneously running migrations. You may want to issue a command like "set lock_timeout = '10s'" if this happens frequently. Othrewise, this command may wait until the process is killed.`
      console.warn({message})
    }, this.lockWarningMs)
    await this.client.any(sql`select pg_advisory_lock(${this.advisoryLockId()})`)
    clearTimeout(timeout)
    return {took: Date.now() - start}
  }

  async releaseAdvisoryLock() {
    await this.client.any(sql`select pg_advisory_unlock(${this.advisoryLockId()})`).catch(error => {
      console.error({
        message: `Failed to unlock. This is expected if the lock acquisition timed out. Otherwise, you may need to run "select pg_advisory_unlock(${this.advisoryLockId()})" manually`,
        originalError: error,
      })
    })
  }

  async useAdvisoryLock<T>(fn: () => Promise<T>) {
    try {
      await this.waitForAdvisoryLock()
      return await fn()
    } finally {
      await this.releaseAdvisoryLock()
    }
  }

  // async runCommand<T>(command: string, cb: (params: {context: MigratorContext}) => Promise<T>) {
  //   let run = cb
  //   if (command === 'up' || command === 'down') {
  //     run = async ({context}) => {
  //       try {
  //         await this.waitForAdvisoryLock()
  //         return await this.connect(async conn => cb({context: {...context, connection: conn}}))
  //       } finally {
  //         await this.releaseAdvisoryLock()
  //       }
  //     }
  //   }

  //   return super.runCommand(command, async ({context}) => {
  //     await this.getOrCreateMigrationsTable()
  //     return run({context})
  //   })
  // }

  // async _repair(options?: RepairOptions) {
  //   const dryRun = options?.dryRun ?? false

  //   await this.useAdvisoryLock(async () => {
  //     const infos = await this.executedInfos()
  //     const migrationsThatNeedRepair = infos.filter(({dbHash, diskHash}) => dbHash !== diskHash)

  //     if (migrationsThatNeedRepair.length === 0) {
  //       this.logger.info({message: 'Nothing to repair'})
  //       return
  //     }

  //     for (const {migration, dbHash, diskHash} of migrationsThatNeedRepair) {
  //       this.logger.warn({
  //         message: `Repairing migration ${migration} ${dryRun ? '(dry run)' : ''}`.trim(),
  //         migration,
  //         oldHash: dbHash,
  //         newHash: diskHash,
  //         dryRun,
  //       })

  //       if (!dryRun) await this.repairMigration({name: migration, hash: diskHash})
  //     }
  //   })
  // }

  protected hash(name: string) {
    return createHash('md5')
      .update(readFileSync(path.join(this.migratorOptions.migrationsPath, name), 'utf8').trim().replaceAll(/\s+/g, ' '))
      .digest('hex')
      .slice(0, 10)
  }

  get tableName() {
    return [this.migratorOptions.migrationTableName].flat().join('.')
  }

  // protected async executedNames() {
  //   const infos = await this.executedInfos()

  //   infos
  //     .filter(({dbHash, diskHash}) => dbHash !== diskHash)
  //     .forEach(({migration, dbHash, diskHash}) => {
  //       console.warn({
  //         message: `hash in '${this.tableName}' table didn't match content on disk.`,
  //         question: `Did you try to change a migration file after it had been run? You might need to run the 'repair' command.`,
  //         migration,
  //         dbHash,
  //         diskHash,
  //       })
  //     })

  //   return infos.map(({migration}) => migration)
  // }

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
    await context.connection.one(sql`
      update ${this.migrationTableNameIdentifier()}
      set hash = ${hash}
      where name = ${name}
      returning *
    `)
  }

  /**
   * Applies pending migrations.
   */
  async up(params?: {to?: string}) {
    const pending = await this.pending()
    const toIndex = params?.to ? pending.findIndex(m => m.name === params.to) : pending.length
    if (toIndex === -1) {
      throw new Error(`Migration ${params?.to} not found`, {cause: {pending}})
    }

    return this.useContext(async context => {
      const list = pending.slice(0, toIndex + 1)
      for (const m of list) {
        console.log(`Applying migration ${m.name} (${this.client.connectionString()})`)
        const p = {...m, context}
        await this.applyMigration(p)
        await this.logMigration(p)
        console.log(`Applied migration ${m.name} (${this.client.connectionString()})`)
      }
      return list
    })
  }

  async latest(params?: {skipCheck?: boolean}) {
    if (!params?.skipCheck) {
      await this.check()
    }
    const executed = await this.executed()
    return executed.at(-1)
  }

  async useContext<T>(fn: (context: MigratorContext) => Promise<T>) {
    return this.useAdvisoryLock(async () => {
      await this.getOrCreateMigrationsTable()
      return this.connect(async connection => {
        return fn({sql, connection})
      })
    })
  }

  /**
   * Calculates the SQL required to forcible go to a specific migration, and applies it if the `confirm` function returns true.
   * This can be used to go "down" to a specific migration (or up, but in most cases the `up` command would be more appropriate).
   *
   * Remember: "goto considered harmful" - the generated SQL may be destructive, and should be reviewed. This should usually not be used in production.
   * In production, create a regular migration which does whichever `drop x` or `alter y` commands are necessary.
   */
  async goto(params: {name: string; confirm: Confirm; purgeDisk?: boolean}) {
    const diffTo = await this.getDiffTo(params)
    if (params.confirm(diffTo)) {
      await this.client.query(sql.raw(diffTo))
      await this.baseline({name: params.name, purgeDisk: params.purgeDisk})
    }
  }

  /**
   * Marks all migrations up to and including the specified migration as executed in the database.
   * Useful when introducing this migrator to an existing database, and you know that the database matches the state up to a specific migration.
   */
  async baseline(params: {name: string; purgeDisk?: boolean}) {
    const list = await this.list()
    const index = list.findIndex(m => m.name === params.name)
    if (index === -1) {
      throw new Error(`Migration ${params.name} not found`, {
        cause: {list},
      })
    }
    await this.useContext(async context => {
      await context.connection.query(sql`
        delete from ${this.migrationTableNameIdentifier()}
      `)
      const records = list.slice(0, index + 1).map(m => ({name: m.name, hash: m.name}))

      // jsonb_to_recordset preferable over unnest I guess? https://contra.com/p/P7kB2RPO-bulk-inserting-nested-data-into-the-database-part-ii
      await context.connection.query(sql`
        insert into ${this.migrationTableNameIdentifier()} (name, hash)
        select *
        from jsonb_to_recordset(${JSON.stringify(records)}) AS t(name text, hash text)
      `)

      if (params.purgeDisk) {
        for (const m of list.slice(index + 1)) {
          await fs.rm(m.path)
        }
      }
    })
  }

  /**
   * Creates a new migration file. By default, uses the definitions file to generate the content.
   * You can override this behavior by passing in a `content` parameter.
   * Pass in empty string if you're not sure what to write and don't want to use the definitions file.
   */
  async create(params: {name: string; content?: string}) {
    let content = params.content
    if (typeof content !== 'string') {
      content = await this.diffVsDDL()
    }
    if (!content) {
      content = '-- Write your migration here'
    }

    const filepath = path.join(this.migratorOptions.migrationsPath, params.name)
    if (!filepath.endsWith('.sql')) {
      throw new Error(`Only SQL migrations are supported right now. Got ${filepath}`)
    }

    await fs.writeFile(filepath, content)
  }

  async diffVsDDL() {
    const content = await readFile(this.definitionsFile, 'utf8')
    return this.useShadowClient(async shadowClient => {
      await shadowClient.query(sql.raw(content))
      const {sql: diff} = await this.wrapMigra(this.client, shadowClient)
      return diff.trim()
    })
  }

  /**
   * Uses the definitions file to update the database schema.
   */
  async updateDBFromDDL(params: {confirm: Confirm}) {
    const diff = await this.diffVsDDL()
    if (params.confirm(diff)) {
      await this.client.query(sql.raw(diff))
    }
  }

  /**
   * Uses the current state of the database to overwrite the definitions file.
   */
  async updateDDLFromDB() {
    const {sql: diff} = await this.wrapMigra('EMPTY', this.client)
    await fs.writeFile(this.definitionsFile, diff)
  }

  async getRepairDiff() {
    const exectued = await this.executed()
    return this.useShadowMigrator(async shadowMigrator => {
      await shadowMigrator.up({to: exectued.at(-1)?.name})
      const {sql: diff} = await this.wrapMigra(this.client, shadowMigrator.client)
      return diff.trim()
    })
  }

  async repair(params: {confirm: Confirm}) {
    const diff = await this.getRepairDiff()
    if (params.confirm(diff)) {
      await this.client.query(sql.raw(diff))
    }
  }

  async check() {
    const diff = await this.getRepairDiff()
    if (diff) {
      throw new Error(`Database is out of sync with migrations. Try using repair`, {cause: {diff}})
    }
  }

  async list() {
    await this.getOrCreateMigrationsTable()
    const executed = await this.client.any(sql<{name: string}>`select * from ${this.migrationTableNameIdentifier()}`)
    const executedNames = new Set(executed.map(r => r.name))

    const dir = await fs.readdir(this.migratorOptions.migrationsPath)
    const files = dir.filter(f => f.endsWith('.sql'))

    return files.map(
      (name): ListedMigration => ({
        name,
        path: path.join(this.migratorOptions.migrationsPath, name),
        status: executedNames.has(name) ? 'executed' : 'pending',
      }),
    )
  }

  async pending() {
    const list = await this.list()
    return list.filter((m): m is PendingMigration => m.status === 'pending')
  }

  async executed() {
    const list = await this.list()
    return list.filter((m): m is ExecutedMigration => m.status === 'executed')
  }

  // /**
  //  * Given a list of SQL definition files (typically `create table ...; create index ...` type statements), this will create
  //  * a new migration would bring the database to the state described by the SQL files.
  //  * Note that the created migration should always be reviewed before running it in production.
  //  */
  // async diffCreate(
  //   sqlFiles: string[],
  //   {migraOptions = {} as Flags, createOptions = {} as Omit<Parameters<Migrator['create']>[0], 'content'>} = {},
  // ) {
  //   const pending = await this.pending()
  //   if (pending.length > 0) {
  //     throw new Error(`There are pending migrations. Run them before creating a diff migration.`, {cause: pending})
  //   }

  //   const shadowDb = `shadow_${Math.random().toString(36).slice(2)}`
  //   const shadowConnectionString = this.client.connectionString().replace(/\w+$/, shadowDb)
  //   const shadowClient = createClient(shadowConnectionString, {
  //     pgpOptions: this.client.pgpOptions,
  //   })
  //   this.logger.info({message: `Creating shadow database ${shadowDb}`})
  //   await this.client.query(sql`create database ${sql.identifier([shadowDb])}`)
  //   await Migrator.getOrCreateMigrationsTable({client: shadowClient, table: this.migrationTableNameIdentifier()})
  //   try {
  //     for (const file of sqlFiles) {
  //       this.logger.info({message: `Running ${file} in shadow database`})
  //       const query = await readFile(file)
  //       await shadowClient.query(sql.raw(query.toString()))
  //     }

  //     this.logger.info({message: `Running migra to generate diff migration`})
  //     const {sql: content} = await this.wrapMigra(this.client.connectionString(), shadowConnectionString, {
  //       unsafe: true,
  //       ...migraOptions,
  //     })

  //     await this.create({
  //       name: nameQuery([content]) + '.sql',
  //       ...createOptions,
  //       content,
  //     })
  //   } finally {
  //     await shadowClient.end()
  //     // todo: figure out why this times out. Until then, just leave the shadow db around :Z
  //     await this.client.query(sql`drop database ${sql.identifier([shadowDb])} with (force)`)
  //   }
  // }

  // async writeDefinitionFile(filepath: string) {
  //   const pending = await this.pending()
  //   if (pending.length > 0) {
  //     throw new Error(`There are pending migrations. Run them before creating a definition file.`, {cause: pending})
  //   }

  //   const shadowDb = `shadow_${Math.random().toString(36).slice(2)}`
  //   const shadowConnectionString = this.client.connectionString().replace(/\w+$/, shadowDb)
  //   const shadowClient = createClient(shadowConnectionString, {
  //     pgpOptions: this.client.pgpOptions,
  //   })

  //   try {
  //     this.logger.info({message: `Creating shadow database ${shadowDb}`})
  //     await this.client.query(sql`create database ${sql.identifier([shadowDb])}`)
  //     await Migrator.getOrCreateMigrationsTable({client: shadowClient, table: this.migrationTableNameIdentifier()})

  //     // todo: pass clients through so we don't have to create duplicate clients
  //     const migration = await this.wrapMigra(shadowClient.connectionString(), this.client.connectionString())
  //     await writeFile(filepath, migration.sql)
  //   } finally {
  //     await shadowClient.end()
  //   }
  // }

  /**
   * Get a new instance of `this`. Options passed will be spread with `migratorOptions` passed to the constructor of the current instance.
   * In subclasses with different constructor parameters, this should be overridden to return an instance of the subclass.
   *
   * @example
   * ```ts
   * class MyMigrator extends Migrator {
   *   options: MyMigratorOptions
   *   constructor(options: MyMigratorOptions) {
   *     super(convertMyOptionsToBaseOptions(options))
   *     this.options = options
   *   }
   *
   *  cloneWith(options?: MigratorOptions) {
   *    const MigratorClass = this.constructor as typeof MyMigrator
   *    const myOptions = convertBaseOptionsToMyOptions(options)
   *    return new MyMigrator({...this.options, ...options})
   *  }
   * ```
   */
  cloneWith(options?: Partial<MigratorOptions>) {
    const MigratorClass = this.constructor as typeof Migrator
    return new MigratorClass({...this.migratorOptions, ...options})
  }

  /**
   * @experimental
   * Creates a "down" migration equivalent to the specified "up" migration.
   */
  // async generateDownMigration(migration: {name: string}) {
  //   const shadowClients = ['a', 'b'].map(letter => {
  //     const dbName = `shadow_${letter}_${Math.random().toString(36).slice(2)}`
  //     const connectionString = this.client.connectionString().replace(/\w+$/, dbName)
  //     const client = createClient(connectionString, {
  //       pgpOptions: this.client.pgpOptions,
  //     })

  //     const migrator = this.cloneWith({client})

  //     const create = () => this.client.query(sql`create database ${sql.identifier([dbName])}`)

  //     const lookup = async () => {
  //       const pending = await migrator.pending()
  //       const index = pending.findIndex(m => m.name === migration.name)
  //       if (index === -1) {
  //         throw new Error(`Migration ${migration.name} not found`)
  //       }
  //       return {index, pending, migration: pending[index], previous: pending[index - 1] || null}
  //     }

  //     return {name: dbName, client, create, migrator, lookup}
  //   })

  //   for (const shadow of shadowClients) {
  //     await shadow.create()
  //   }

  //   const [left, right] = await Promise.all(shadowClients.map(async c => ({...c, info: await c.lookup()})))

  //   if (left.info.index !== right.info.index) {
  //     throw new Error(`Migrations are out of sync: ${JSON.stringify(left.info)} !== ${JSON.stringify(right.info)}`)
  //   }

  //   await left.migrator.up({to: left.info.migration.name})

  //   if (right.info.previous) {
  //     await right.migrator.up({to: right.info.previous.name})
  //   }

  //   const {sql: content} = await this.wrapMigra(left.client, right.client, {unsafe: true})

  //   return {content, info: left.info}
  // }

  /**
   * @experimental
   * Uses `migra` to generate a diff between the current database and the state of a database at the specified migration.
   * This can be used to go "down" to a specific migration.
   */
  async getDiffTo(target: {name: string}) {
    const {sql: content} = await this.useShadowMigrator(async shadowMigrator => {
      await shadowMigrator.up({to: target.name})
      return this.wrapMigra(this.client, shadowMigrator.client, {unsafe: true})
    })
    return content
  }

  // async downTo(params: {name: string; confirm: (sql: string) => boolean}) {
  //   const diff = await this.getDiffTo(params)
  //   if (!params.confirm(diff)) {
  //     throw new Error('Confirmation failed')
  //   }
  //   await this.client.query(sql.raw(diff))
  // }

  /**
   * Creates a temporary database, and runs the provided callback with a migrator instance connected to the temporary database.
   * After the callback resolves or rejects, the temporary database is dropped forcefully.
   */
  async useShadowClient<T>(cb: (client: Client) => Promise<T>) {
    const shadowDbName = `shadow_${Math.random().toString(36).slice(2)}`
    const shadowConnectionString = this.client.connectionString().replace(/\w+$/, shadowDbName)
    const shadowClient = createClient(shadowConnectionString, {pgpOptions: this.client.pgpOptions})

    try {
      await this.client.query(sql`create database ${sql.identifier([shadowDbName])}`)

      return await cb(shadowClient)
    } finally {
      await shadowClient.end()
      await this.client
        .query(sql`drop database ${sql.identifier([shadowDbName])} with (force)`)
        .catch(async e => {
          if (e.message.includes('syntax error at or near "with"')) {
            // postgresql 12 backcompat
            await this.client.query(sql`drop database ${sql.identifier([shadowDbName])}`)
            return
          }
          throw e
        })
        .catch(e => {
          if (e.message.includes('does not exist')) return // todo: check this error message?
          throw e
        })
    }
  }

  /**
   * Creates a temporary database, and runs the provided callback with a migrator instance connected to the temporary database.
   * After the callback resolves or rejects, the temporary database is dropped forcefully.
   */
  async useShadowMigrator<T>(cb: (migrator: Migrator) => Promise<T>) {
    return await this.useShadowClient(async shadowClient => {
      const shadowMigrator = this.cloneWith({client: shadowClient})
      await shadowMigrator.getOrCreateMigrationsTable()
      return await cb(shadowMigrator)
    })
  }

  /**
   * The base implementation just calls `migra.run`. You can override this method to manually reorder statements.
   * This is necessary sometimes because migra doesn't alwyas generate statements in the right order. https://github.com/djrobstep/migra/issues/196
   *
   * @example
   * import {Migrator as Base} from '@pgkit/migrator'
   *
   * export class Migrator extends Base {
   *   async wrapMigra() {
   *     const migration = await super.wrapMigra()
   *     const firstCreateTahleStatement = migration.statements.findIndex(s => s.match(/create table/))
   *     migration.statements.sortBy((s, i) => {
   *       return s.match(/create type/) ? Math.min(i, firstCreateTahleStatement - 1) : i
   *     })
   *     return migration
   *   }
   * }
   */
  async wrapMigra(...args: Parameters<typeof migra.run>) {
    return migra.run(...args)
  }
}
