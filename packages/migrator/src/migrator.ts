import {sql, Client, Connection, createClient, nameQuery} from '@pgkit/client'
import {formatSql} from '@pgkit/formatter'
import * as migra from '@pgkit/migra'
import {createHash, randomInt} from 'crypto'
import {readFileSync} from 'fs'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as umzug from 'umzug'
import * as templates from './templates'
import {MigratorContext} from './types'

export type Confirm = (sql: string) => Promise<boolean>
export interface BaseListedMigration {
  name: string
  path: string
  content: string
}
export interface PendingMigration extends BaseListedMigration {
  status: 'pending'
}
export interface ExecutedMigration extends BaseListedMigration {
  status: 'executed'
}
export type ListedMigration = PendingMigration | ExecutedMigration

export type RunnableMigration = umzug.RunnableMigration<MigratorContext>

export interface MigratorOptions {
  /** @pgkit/client instance */
  client: Client
  migrationsPath: string
  migrationTableName?: string | string[]
  /**
   * Whether to use `client.transaction(tx => ...)` or `client.connect(cn => ...)` when running up/down migrations
   * @default `transaction`
   */
  connectMethod?: 'transaction' | 'connect'
}

export class Migrator {
  constructor(readonly migratorOptions: MigratorOptions) {}

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
    const table = this.migratorOptions.migrationTableName || 'migrations'
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

  protected async applyMigration(params: {name: string; path: string; context: MigratorContext}) {
    if (path.extname(params.path) === '.sql') {
      const content = await fs.readFile(params.path, 'utf8')
      return params.context.connection.query(sql.raw(content))
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod: RunnableMigration = await import(params.path)
    return mod.up(params)
  }

  protected resolver(params: {name: string; path: string}): RunnableMigration {
    return {
      name: params.name,
      path: params.path,
      up: upParams => this.applyMigration({...upParams, path: params.path}),
    }
  }

  protected async getOrCreateMigrationsTable() {
    await Migrator.getOrCreateMigrationsTable({client: this.client, table: this.migrationTableNameIdentifier()})
  }

  static async getOrCreateMigrationsTable(params: {client: Client; table: ReturnType<typeof sql.identifier>}) {
    // todo: use migra to make sure the table has the right definition?
    await params.client.query(sql`
      create table if not exists ${params.table}(
        name text primary key,
        hash text not null,
        date timestamptz not null default now()
      )
    `)
  }

  /** Wait this many milliseconds before logging a message warning that the advisory lock hasn't been acquired yet. */
  get lockWarningMs() {
    return 1000
  }

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

  protected hash(name: string) {
    return createHash('md5')
      .update(readFileSync(path.join(this.migratorOptions.migrationsPath, name), 'utf8').trim().replaceAll(/\s+/g, ' '))
      .digest('hex')
      .slice(0, 10)
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
    if (await params.confirm(diffTo)) {
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
   * Gets a string prefix for migrations. By default, this is the current date and time in ISO format, with `-`/`:` characters replaced by `.`.
   * Override this method to change the prefix format. Take care that migrations are generated in lexicographic order, so the prefix should be sortable.
   * */
  filePrefix() {
    return (
      new Date()
        .toISOString()
        .replaceAll(/\W/g, '.')
        .replace(/\.\d{3}/, '') + '.'
    )
  }

  /**
   * Creates a new migration file. By default, uses the definitions file to generate the content.
   * You can override this behavior by passing in a `content` parameter.
   * Pass in empty string if you're not sure what to write and don't want to use the definitions file.
   */
  async create(params?: {name?: string; content?: string}) {
    let content = params?.content
    if (typeof content !== 'string') {
      content = await this.diffVsDDL()
    }

    let nameSuffix = params?.name
    if (!nameSuffix && content) {
      nameSuffix = nameQuery([content]).replace(/_[\da-z]+$/, '') + '.sql'
    }

    if (!content) {
      content = '-- Write your migration here'
    }

    if (!nameSuffix) {
      nameSuffix = 'update.sql'
    }

    const name = this.filePrefix() + nameSuffix
    const filepath = path.join(this.migratorOptions.migrationsPath, name)
    if (!filepath.endsWith('.sql')) {
      throw new Error(`Only SQL migrations are supported right now. Got ${filepath}`)
    }

    await fs.writeFile(filepath, content)
    return {name, path: filepath, content}
  }

  /**
   * Rebase migrations since the specified `from` migration. This will:
   *
   * 1. baseline migrations to `from`, and delete all migrations from disk after `from`
   * 2. create a new migration with the diff between the state at `from` and the current database state
   * 3. baseline the database to the new migration
   *
   * Other than baselining the migrations, it does *not* update your database state.
   *
   * Use this if you have tinkered with the database manually, with a query editor or another external tool, and now want to port those changes into a migration.
   *
   * Often, you may want to rebase from the last production migration, since migrations that have run in production should
   * usually be considered permanent. Any destructive commands in production should be in an explicit new migration.
   */
  async rebase(params: {from: string; confirm: Confirm; name?: string}) {
    const diff = await this.getDiffFrom({name: params.from})
    if (await params.confirm(diff)) {
      await this.baseline({name: params.from, purgeDisk: true})
      const created = await this.create({content: diff})
      await this.baseline({name: created.name})
    }
  }

  async diffVsDDL() {
    const content = await fs.readFile(this.definitionsFile, 'utf8')
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
    if (await params.confirm(diff)) {
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
    if (await params.confirm(diff)) {
      await this.client.query(sql.raw(diff))
    }
  }

  async check() {
    const diff = await this.getRepairDiff()
    if (diff) {
      throw new Error(`Database is out of sync with migrations. Try using repair`, {cause: {diff}})
    }
  }

  async list(): Promise<ListedMigration[]> {
    await this.getOrCreateMigrationsTable()
    const executed = await this.client.any(sql<{name: string}>`select * from ${this.migrationTableNameIdentifier()}`)
    const executedNames = new Set(executed.map(r => r.name))

    const dir = await fs.readdir(this.migratorOptions.migrationsPath)
    const files = dir.filter(f => f.endsWith('.sql'))

    return Promise.all(
      files.map(async (name): Promise<ListedMigration> => {
        const filepath = path.join(this.migratorOptions.migrationsPath, name)
        return {
          name,
          path: filepath,
          content: await fs.readFile(filepath, 'utf8'),
          status: executedNames.has(name) ? 'executed' : 'pending',
        }
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

  /**
   * Uses `migra` to generate a diff between the state of a database at the specified migration, and the current state of the database.
   */
  async getDiffFrom(params: {name: string}) {
    const {sql: content} = await this.useShadowMigrator(async shadowMigrator => {
      await shadowMigrator.up({to: params.name})
      return this.wrapMigra(shadowMigrator.client, this.client, {unsafe: true})
    })
    return content
  }

  /**
   * Creates a temporary database and runs the callback with a client connected to it.
   * After the callback resolves or rejects, the temporary database is dropped forcefully.
   */
  async useShadowClient<T>(cb: (client: Client) => Promise<T>) {
    const shadowDbName = `shadow_${Date.now()}_${randomInt(1_000_000)}`
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
    const result = await migra.run(args[0], args[1], {unsafe: true, ...args[2]})
    return {
      result,
      sql: formatSql(result.sql),
    }
  }
}
