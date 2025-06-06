import {sql, Client, Connection, createClient, nameQuery} from '@pgkit/client'
import {formatSql} from '@pgkit/formatter'
import * as migra from '@pgkit/migra'
import {AsyncLocalStorage} from 'async_hooks'
import {createHash, randomInt} from 'crypto'
import {existsSync, readFileSync} from 'fs'
import * as fs from 'fs/promises'
import * as path from 'path'
import {createCli} from 'trpc-cli'
import {confirm} from './cli'
import {createMigratorRouter} from './router'
import * as templates from './templates'
import {
  MigratorConfig,
  MigratorConstructorParams,
  Logger,
  Task,
  MigratorContext,
  RunnableMigration,
  Confirm,
  ListedMigration,
  PendingMigration,
  ExecutedMigration,
} from './types'

export const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
}

export const noopTask = async <T>(name: string, fn: () => Promise<T>) => {
  return {result: await fn()}
}

export class Migrator {
  configStorage = new AsyncLocalStorage<Partial<MigratorConfig>>()

  /**
   * The config set in the constructor of the class. Note: in almost all cases, you should use @see config instead,
   * since the client could be overriden.
   */
  protected initialConfig: MigratorConfig

  constructor(params: MigratorConstructorParams) {
    // todo: sensible defaults somewhere? Either way, these should always be defined
    if (!params.migrationsPath) {
      throw new Error('migrationsPath is required')
    }
    if (!params.migrationTableName) {
      throw new Error('migrationTableName is required')
    }

    this.initialConfig = {
      task: async (name, fn) => {
        this.logger.info('Starting', name)
        const result = await fn()
        this.logger.info('Finished', name)
        return {result}
      },
      logger: console,
      ...params,
      client: typeof params.client === 'string' ? createClient(params.client) : params.client,
    }
  }

  get client() {
    return this.config.client
  }

  useConfig<T>(config: Partial<MigratorConfig>, fn: () => Promise<T>) {
    return this.configStorage.run(config, () => fn())
  }

  protected get config(): MigratorConfig {
    const store = this.configStorage.getStore()
    return {
      ...this.initialConfig,
      ...store,
    }
  }

  get logger(): Logger {
    return this.config.logger
  }

  get task(): Task {
    return (name, fn) =>
      this.config.task(name, async () => {
        return fn().catch((cause: unknown) => {
          throw new Error(`${name} failed: ${String(cause) || 'Unknown error'}`, {cause})
        })
      })
  }

  cli() {
    const router = createMigratorRouter()
    return createCli({router, context: {migrator: this, confirm}})
  }

  /** Gets a hexadecimal integer to pass to postgres's `select pg_advisory_lock()` function */
  protected advisoryLockId() {
    const hashable = '@pgkit/migrator advisory lock:' + JSON.stringify(this.config.migrationTableName)
    const hex = createHash('md5').update(hashable).digest('hex').slice(0, 8)
    return Number.parseInt(hex, 16)
  }

  protected get migrationTable() {
    const table = this.config.migrationTableName || 'migrations'
    if (table.length === 0) {
      throw new Error(`Invalid migration table name: ${JSON.stringify(table)}`)
    } else if (Array.isArray(table) && table.length > 2) {
      throw new Error(`Invalid migration table name: ${table.join('.')}`)
    } else if (Array.isArray(table)) {
      return {schema: table.at(-2) || null, table: table.at(-1)!}
    } else {
      return {schema: null, table}
    }
  }

  protected migrationTableNameIdentifier() {
    return this.migrationTable.schema
      ? sql.identifier([this.migrationTable.schema, this.migrationTable.table])
      : sql.identifier([this.migrationTable.table])
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
    await this.client.query(this.createMigrationsTableSQL)
  }

  protected get createMigrationsTableSQL() {
    return sql`
      create table if not exists ${this.migrationTableNameIdentifier()}(
        name text primary key,
        content text not null,
        status text,
        date timestamptz not null default now()
      )
    `
  }

  /** Wait this many milliseconds before logging a message warning that the advisory lock hasn't been acquired yet. */
  get lockWarningMs() {
    return 1000
  }

  get definitionsFile() {
    return path.join(this.config.migrationsPath, '../definitions.sql')
  }

  async connect<T>(fn: (connection: Connection) => Promise<T>) {
    const {connectMethod = 'transaction'} = this.config
    return this.client[connectMethod](fn)
  }

  async waitForAdvisoryLock() {
    const start = Date.now()
    const timeout = setTimeout(() => {
      const message = `Waiting for lock. This may mean another process is simultaneously running migrations. You may want to issue a command like "set lock_timeout = '10s'" if this happens frequently. Othrewise, this command may wait until the process is killed.`
      this.logger.warn(message)
    }, this.lockWarningMs)
    try {
      await this.client.any(sql`select pg_advisory_lock(${this.advisoryLockId()})`)
    } finally {
      clearTimeout(timeout)
    }
    return {took: Date.now() - start}
  }

  async releaseAdvisoryLock() {
    await this.client.any(sql`select pg_advisory_unlock(${this.advisoryLockId()})`).catch((error: unknown) => {
      this.logger.error({
        message: `Failed to unlock. This is expected if the lock acquisition timed out. Otherwise, you may need to run "select pg_advisory_unlock(${this.advisoryLockId()})" manually`,
        cause: error,
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

  protected content(name: string) {
    return readFileSync(path.join(this.config.migrationsPath, name), 'utf8')
  }

  /**
   * Determine if a given migration name should be considered repeatable.
   */
  protected isRepeatable(name: string) {
    return name.match(/repeatable\.\w+$/)
  }

  protected async logMigration({name, context}: {name: string; context: MigratorContext}) {
    await context.connection.query(sql`
      insert into ${this.migrationTableNameIdentifier()}(name, content, status)
      values (${name}, ${this.content(name)}, 'executed')
      on conflict (name) do update
      set
        content = excluded.content,
        status = excluded.status,
        date = excluded.date
    `)
  }

  protected async unlogMigration({name, context}: {name: string; context: MigratorContext}) {
    await context.connection.query(sql`
      delete from ${this.migrationTableNameIdentifier()}
      where name = ${name}
    `)
  }

  /**
   * Applies pending migrations.
   */
  async up(input?: {to?: string} | {step?: number}) {
    let params: {to?: string} = {}
    if (input && 'to' in input && input.to !== undefined) {
      params = input
    } else if (input && 'step' in input && input.step !== undefined) {
      const pending = await this.pending()
      const target = pending.at(input.step - 1)
      if (!target) {
        throw new Error(`Couldn't find ${input.step} pending migrations`, {cause: {pending}})
      }
      params = {to: target?.name}
    }
    const pending = await this.pending()
    const toIndex = params?.to ? pending.findIndex(m => m.name === params.to) : pending.length
    if (toIndex === -1) {
      throw new Error(`Migration ${params?.to} not found`, {cause: {pending}})
    }

    await this.useContext(async context => {
      const list = pending.slice(0, toIndex + 1)
      for (const m of list) {
        const taskName = ['Applying', m.name, m.note && `(${m.note})`].filter(Boolean).join(' ')
        await this.task(taskName, async () => {
          const p = {...m, context}
          await this.applyMigration(p)
          await this.logMigration(p)
        })
      }
    })
  }

  async unlock(params: {confirm: Confirm}) {
    const message =
      '*** WARNING ***: This will release the advisory lock. If you have multiple servers running migrations, this could cause more than one to try to apply migrations simultaneously. Are you sure?'
    if (await params.confirm(message, {readonly: true})) {
      await this.releaseAdvisoryLock()
    }
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
   * Remember: "goto considered harmful" - the generated SQL may be destructive, and should be reviewed.
   * This should usually not be used in production, unless it's required to introduce this tool to an existing system.
   * In production, you would usually prefer to create a regular migration which does whichever `drop x` or `alter y` commands are necessary.
   */
  async goto(params: {name: string; confirm: Confirm; purgeDisk?: boolean}) {
    const diffTo = await this.getDiffTo({name: params.name})
    const confirmation = await params.confirm(diffTo)
    if (confirmation) {
      await this.useAdvisoryLock(async () => {
        await this.client.query(sql.raw(confirmation))
        await this.baseline({
          to: params.name,
          purgeDisk: params.purgeDisk,
          confirm: async () => 'confirmed',
        })
      })
    }
  }

  private async getMigrationsTableInspected() {
    const emptyDiff = await this.wrapMigra('EMPTY', this.client)
    return Object.values(emptyDiff.result.changes.i_target.tables).find(table => {
      return (
        table.name === this.migrationTable.table &&
        (!this.migrationTable.schema || table.schema === this.migrationTable.schema)
      )
    })
  }

  private async getMigrationsTableFixStatements() {
    const currentTable = await this.getMigrationsTableInspected()
    const expectedTable = await this.useShadowClientConfig(async () => {
      await this.getOrCreateMigrationsTable()
      return this.getMigrationsTableInspected()
    })

    if (JSON.stringify(currentTable) === JSON.stringify(expectedTable)) {
      return []
    }

    return [
      sql`drop table if exists ${this.migrationTableNameIdentifier()}`, //
      this.createMigrationsTableSQL,
    ]
  }

  /**
   * Marks all migrations up to and including the specified migration as executed in the database.
   * Useful when introducing this migrator to an existing database, and you know that the database matches the state up to a specific migration.
   */
  async baseline(params: {to: string; purgeDisk?: boolean; confirm: Confirm}) {
    const list = await this.list()
    const index = list.findIndex(m => m.name === params.to)
    if (index === -1) {
      throw new Error(`Migration ${params.to} not found`, {
        cause: {list},
      })
    }

    const records = list.slice(0, index + 1).map(m => ({
      name: m.name,
      content: m.content,
      status: 'executed',
    }))
    const tableFixStatements = await this.getMigrationsTableFixStatements()
    const queries = [
      ...tableFixStatements,
      sql`delete from ${this.migrationTableNameIdentifier()}`,
      sql`
        insert into ${this.migrationTableNameIdentifier()} (name, content, status)
        select *
        from jsonb_to_recordset(${JSON.stringify(records, null, 2)})
          as t(name text, content text, status text)
      `,
    ]

    const ok = await params.confirm(this.renderConfirmable(queries), {readonly: true})
    if (!ok) return

    await this.useContext(async context => {
      for (const query of queries) {
        await context.connection.query(query)
      }

      if (params.purgeDisk) {
        for (const m of list.slice(index + 1)) {
          await fs.rm(m.path)
        }
      }
    })

    const diff = await this.getRepairDiff()
    if (diff.length > 0) {
      throw new Error(
        `Baselined successfully, but database is now out of sync with migrations. Try using \`repair\` to update the database.`,
        {cause: {diff}},
      )
    }
  }

  renderStatement(q: {sql: string; values: unknown[]}) {
    const lines = [
      q.sql
        .replace(/^\n/, '')
        .replaceAll(q.sql.match(/^\n?(\s*)/)![1]!, '')
        .trim(),
      q.values.length > 0 ? `parameters: [${q.values.join(',')}]` : (undefined as never),
    ]
    return lines.filter(Boolean).join('\n').trim()
  }

  renderConfirmable(queries: {sql: string; values: unknown[]}[], sep = '\n\n---\n\n') {
    return queries.map(q => this.renderStatement(q)).join(sep)
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
   * Pass in empty string or something like `-- placeholder` if you're not sure what to write and don't want to use the definitions file.
   */
  async create(params?: {name?: string; content?: string}) {
    let content = params?.content
    const isSql = !params?.name || params.name.endsWith('.sql')
    if (typeof content !== 'string' && isSql) {
      const diff = await this.getRepairDiff()
      content = diff.map(d => d.sql).join('\n\n')
    }

    let nameSuffix = params?.name
    if (!nameSuffix && content) {
      nameSuffix = nameQuery([content]).replace(/_[\da-z]+$/, '') + '.sql'
    }

    if (!nameSuffix) {
      nameSuffix = 'update.sql'
    }

    const template = this.templates[path.extname(nameSuffix)]
    if (typeof template !== 'string') {
      throw new TypeError(
        `Unsupported file extension ${JSON.stringify(path.extname(nameSuffix))} for name ${nameSuffix}. Supported extensions: ${Object.keys(this.templates).join(', ')}`,
      )
    }

    const name = this.filePrefix() + nameSuffix
    const filepath = path.join(this.config.migrationsPath, name)

    if (!content) {
      content = template
    }

    await fs.mkdir(this.config.migrationsPath, {recursive: true})
    await fs.writeFile(filepath, content)
    return {name, path: filepath, content}
  }

  get templates(): Record<string, string> {
    const js = typeof require?.main === 'object' ? templates.cjs : templates.esm
    return {
      '.js': js,
      '.ts': templates.typescript,
      '.cts': templates.typescript,
      '.mts': templates.typescript,
      '.mjs': templates.esm,
      '.cjs': templates.cjs,
      '.sql': templates.sql,
    }
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
    const tableFixStatements = await this.getMigrationsTableFixStatements()
    const diff = await this.getDiffFrom({name: params.from})
    const lines = [
      '## Steps that will be automatically applied on confirmation:',
      [
        '- First, recreate the migrations table which is not correctly initialised:',
        '',
        this.renderConfirmable(tableFixStatements, '\n\n'),
        '',
        '---',
        '',
        'Then, perform the actual baseline:',
        '',
      ]
        .filter(() => tableFixStatements.length > 0)
        .join('\n'),
      `- Baseline migrations to ${params.from}`, //
      `- Delete all subsequent migration files`,
      diff &&
        `- Create new migration named "{timestamp}.${nameQuery([diff], 'migration').replace(/_[\da-z]+$/, '')}.sql" with content:\n    ${diff.replaceAll('\n', '\n    ')}`,
      diff && `- Baseline migrations to the created migration`,
      '',
      `Note: this will not update the database other than the migrations table. It will modify your filesystem.`,
    ]
    const confirmation = await params.confirm(lines.join('\n'), {readonly: true})
    if (confirmation) {
      await this.baseline({to: params.from, purgeDisk: true, confirm: async () => 'confirmed'})
      if (diff) {
        const created = await this.create({content: diff})
        await this.baseline({to: created.name, confirm: async () => 'confirmed'})
      }
    }
    return this.list()
  }

  async diffToDefinitions() {
    const content = await fs.readFile(this.definitionsFile, 'utf8').catch(() => '')
    return this.useShadowClient(async shadowClient => {
      if (content) await shadowClient.query(sql.raw(content))
      const {sql: diff} = await this.wrapMigra(this.client, shadowClient)
      return diff
    })
  }

  /**
   * Uses the definitions file to update the database schema.
   */
  async updateDbToMatchDefinitions(params: {confirm: Confirm}) {
    const diff = await this.diffToDefinitions()
    const confirmation = await params.confirm(diff)
    if (confirmation) {
      await this.client.query(sql.raw(confirmation))
    }
  }

  /**
   * Uses the current state of the database to overwrite the definitions file.
   */
  async updateDefinitionsToMatchDb(params: {confirm: Confirm}) {
    const {sql: diff} = await this.wrapMigra('EMPTY', this.client)
    const oldContent = await fs.readFile(this.definitionsFile, 'utf8').catch(() => '')
    const changed = formatSql(diff) !== formatSql(oldContent)

    const confirmation = changed ? await params.confirm(diff) : null

    if (confirmation) {
      await fs.mkdir(path.dirname(this.definitionsFile), {recursive: true})
      await fs.writeFile(this.definitionsFile, confirmation)
    }
    return {
      path: this.definitionsFile,
      changed,
      updated: confirmation,
      content: diff,
    }
  }

  /**
   * Calculates the SQL required to alter the DB to match what it *should* be for the latest executed migration.
   * Also recreates the migrations records if necessary (in case migration files have been altered or retroactively added to the filesystem).
   */
  async getRepairDiff() {
    const executed = await this.executed()
    const shadow = await this.useShadowClientConfig(async ({parent}) => {
      if (executed.length > 0) await this.up({to: executed.at(-1)?.name})
      const {sql: diff} = await this.wrapMigra(parent.client, this.client)
      return {diff, executed: await this.executed()}
    })

    const newRecords = shadow.executed.map(m => ({name: m.name, content: m.content, status: 'executed'}))
    type MigrationRecord = {name: string; content: string; status: string}
    const oldRecords = await this.client
      .any(sql<Partial<MigrationRecord>>`select * from ${this.migrationTableNameIdentifier()}`)
      .then(rs => rs.map((r): MigrationRecord => ({name: r.name!, content: r.content!, status: r.status!})))

    const recordsNeedUpdate = JSON.stringify(newRecords) !== JSON.stringify(oldRecords)

    return [
      {
        needed: shadow.diff.length > 0,
        query: sql.raw(shadow.diff),
      },
      {
        needed: recordsNeedUpdate,
        query: sql`
          delete from ${this.migrationTableNameIdentifier()};

          insert into ${this.migrationTableNameIdentifier()} (name, content, status)
          select *
          from jsonb_to_recordset(${JSON.stringify(newRecords, null, 2)})
            as t(name text, content text, status text);
        `,
      },
    ].flatMap(q => (q.needed ? [q.query] : []))
  }

  async repair(params: {confirm: Confirm}) {
    const diff = await this.getRepairDiff()
    const confirmed = await params.confirm(this.renderConfirmable(diff), {readonly: true})
    if (!confirmed) {
      return {drifted: diff.length > 0, updated: false}
    }

    for (const q of diff) {
      await this.client.query(q)
    }

    return {drifted: diff.length > 0, updated: true}
  }

  async check() {
    const diff = await this.getRepairDiff()
    if (diff.length > 0) {
      throw new Error(`Database is out of sync with migrations. Try using repair`, {cause: {diff}})
    }
    return 'Database is in sync with migrations'
  }

  async list(): Promise<ListedMigration[]> {
    await this.getOrCreateMigrationsTable()
    const executed = await this.client.any(
      sql<{name: string; content: string}>`
        select * from ${this.migrationTableNameIdentifier()}
      `,
    )
    const executedByName = new Map(executed.map(r => [r.name, r]))

    const dir = existsSync(this.config.migrationsPath) ? await fs.readdir(this.config.migrationsPath) : []
    const files = dir.filter(f => f.endsWith('.sql'))

    return Promise.all(
      files.map(async (name): Promise<ListedMigration> => {
        const filepath = path.join(this.config.migrationsPath, name)
        const maybeExecuted = executedByName.get(name)
        const content = await fs.readFile(filepath, 'utf8')
        const base = {name, path: filepath, content}

        if (!maybeExecuted) {
          return {...base, status: 'pending'}
        }

        const drifted = content !== maybeExecuted.content
        if (drifted && this.isRepeatable(name)) {
          return {...base, note: 'content updated', status: 'pending'}
        }

        return {
          ...base,
          status: 'executed',
          content: maybeExecuted.content,
          drifted,
          ...(drifted && {
            note: 'Migration file content has updated since execution - try using repair',
          }),
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

  async wipeDiff() {
    const {sql: content} = await this.useShadowClient(async shaowClient => {
      return this.wrapMigra(this.client, shaowClient, {unsafe: true})
    })
    return content
  }

  async wipe(params: {confirm: Confirm}) {
    const diff = await this.wipeDiff()
    const warning = '/* ### THIS WILL DELETE EVERYTHING IN YOUR DATABASE! ### */'
    const confirmation = await params.confirm(warning + '\n\n' + diff)
    if (confirmation) {
      await this.client.query(sql.raw(confirmation))
    }
  }

  /**
   * Uses `migra` to generate a diff between the current database and the state of a database at the specified migration.
   * This is used by @see goto to go "down" to a specific migration.
   */
  async getDiffTo(params: {name: string}) {
    const {sql: content} = await this.useShadowClientConfig(async ({parent}) => {
      await this.up({to: params.name})
      return this.wrapMigra(parent.client, this.client, {unsafe: true})
    })
    return content
  }

  /**
   * Uses `migra` to generate a diff between the state of a database at the specified migration, and the current state of the database.
   */
  async getDiffFrom(params: {name: string}) {
    const {sql: content} = await this.useShadowClientConfig(async ({parent}) => {
      await this.up({to: params.name})
      return this.wrapMigra(this.client, parent.client, {unsafe: true})
    })
    return content
  }

  /**
   * Creates a temporary database and runs the callback with a client connected to it.
   * After the callback resolves or rejects, the temporary database is dropped forcefully.
   */
  async useShadowClient<T>(cb: (client: Client) => Promise<T>) {
    const shadowDbName = `shadow_${Date.now()}_${randomInt(1_000_000)}`

    const shadowConnectionUrl = new URL(this.client.connectionString())
    shadowConnectionUrl.pathname = shadowDbName
    const shadowConnectionString = shadowConnectionUrl.toString()

    const shadowClient = createClient(shadowConnectionString, this.client.options)

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
   * Creates a temporary database, and runs the provided callback with the migrator instance connected to the temporary database.
   * Within the scope of the callback, the migrator instance will be configured to use the temporary database. This is useful for
   * calculating diffs between the current database and the state of the database at a specific migration.
   * The callback will be passed an object with the original client as `parent.client`.
   * After the callback resolves or rejects, the temporary database is dropped forcefully.
   */
  async useShadowClientConfig<T>(cb: (params: {parent: {client: Client}}) => Promise<T>) {
    const parent = {client: this.client}
    return await this.useShadowClient(async client => {
      return this.useConfig({client, logger: noopLogger, task: noopTask}, async () => {
        await this.getOrCreateMigrationsTable()
        return await cb({parent})
      })
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
    const result = await migra.run(args[0], args[1], {
      unsafe: true,
      ...this.initialConfig.defaultMigraOptions,
      ...args[2],
    })
    const formatted = formatSql(result.sql)
    return {
      result,
      sql: formatted.trim(),
    }
  }
}
