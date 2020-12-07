import {createHash} from 'crypto'
import {readFileSync} from 'fs'
import {basename, dirname, join} from 'path'
import * as umzug from 'umzug'
import {sql, DatabasePoolType, DatabaseTransactionConnectionType, IdentifierSqlTokenType} from 'slonik'
import * as path from 'path'
import * as dedent from 'dedent'

interface SlonikMigratorContext {
  parent: DatabasePoolType
  transaction: DatabaseTransactionConnectionType
  sql: typeof sql
  commit: () => Promise<void>
}

export const getTableNameIdentifier = (table: string | string[]) =>
  sql.identifier(Array.isArray(table) ? table : [table])

/**
 * Get an @see umzug.UmzugStorage object.
 */
export const getStorage = ({
  slonik,
  migrationsPath,
  logger,
  migrationTableName,
}: SlonikMigratorOptions): umzug.UmzugStorage<SlonikMigratorContext> => {
  const migrationTableNameIdentifier = getTableNameIdentifier(migrationTableName)

  const hash = (migrationName: string) =>
    createHash('md5')
      .update(readFileSync(join(migrationsPath, migrationName), 'utf8').trim().replace(/\s+/g, ' '))
      .digest('hex')
      .slice(0, 10)

  return {
    async executed({context}) {
      await getOrCreateMigrationsTable(migrationTableNameIdentifier, context)
      const results = await context.parent
        .any(sql`select name, hash from ${migrationTableNameIdentifier}`)
        .then(migrations =>
          migrations.map(r => {
            const name = r.name as string
            /* istanbul ignore if */
            if (r.hash !== hash(name)) {
              logger?.warn({
                message: `hash in '${migrationTableName}' table didn't match content on disk.`,
                question: `did you try to change a migration file after it had been run?`,
                migration: r.name,
                dbHash: r.hash,
                diskHash: hash(name),
              })
            }
            return name
          }),
        )

      return results
    },

    async logMigration(name: string, {context}) {
      await context.transaction.query(sql`
        insert into ${migrationTableNameIdentifier}(name, hash)
        values (${name}, ${hash(name)})
      `)
    },

    async unlogMigration(name: string, {context}) {
      await context.transaction.query(sql`
        delete from ${migrationTableNameIdentifier}
        where name = ${name}
      `)
    },
  }
}

const getOrCreateMigrationsTable = (
  migrationTableNameIdentifier: IdentifierSqlTokenType,
  context: SlonikMigratorContext,
) =>
  context.parent.query(sql`
    create table if not exists ${migrationTableNameIdentifier}(
      name text primary key,
      hash text not null,
      date timestamptz not null default now()
    )
  `)

export const getHooks = ({logger, migrationTableName}: SlonikMigratorOptions) => {
  const migrationTableNameIdentifier = getTableNameIdentifier(migrationTableName)

  /**
   * Use [postgres advisory locks](https://www.postgresql.org/docs/9.6/explicit-locking.html#ADVISORY-LOCKS) in setup and teardown.
   * See [go-migrate](https://github.com/golang-migrate/migrate/blob/15931649a23b380e66a229c61ecd6097ea2fa807/database/postgres/postgres.go#L158-L194).
   * for a similar implementation in go.
   */
  const advisoryLockId = parseInt(
    createHash('md5')
      .update('@slonik/migrator advisory lock:' + JSON.stringify(migrationTableName))
      .digest('hex')
      .slice(0, 8),
    16,
  )

  return {
    async setup({context}: {context: SlonikMigratorContext}) {
      let settle!: Function
      const settledPromise = new Promise(r => (settle = r))

      let ready!: Function
      const readyPromise = new Promise(r => (ready = r))

      const transactionPromise = context.parent.transaction(async transaction => {
        context.transaction = transaction
        ready()

        await settledPromise
      })

      await readyPromise

      context.commit = () => {
        settle()
        return transactionPromise
      }

      const timeout = setTimeout(() => logger?.info({message: `Waiting for lock...`} as any), 1000)
      await context.transaction.any(context.sql`select pg_advisory_lock(${advisoryLockId})`)
      clearTimeout(timeout)

      await getOrCreateMigrationsTable(migrationTableNameIdentifier, context)
    },

    async teardown({context}: {context: SlonikMigratorContext}) {
      await context.transaction.query(context.sql`select pg_advisory_unlock(${advisoryLockId})`).catch(error => {
        logger?.error({
          message: `Failed to unlock. This is expected if the lock acquisition timed out.`,
          originalError: error,
        })
      })
      await context.commit()
    },
  }
}

export const template = (filepath: string) => {
  const templates: Record<string, Array<[string, string]>> = {
    '.sql': [
      [filepath, `raise 'up migration not implemented'`],
      [path.join(path.dirname(filepath), 'down', path.basename(filepath)), `raise 'down migration not implemented'`],
    ],
    '.ts': [
      [
        filepath,
        dedent`
          import {Migration} from '@slonik/migrator'
  
          export const up: Migration = async ({slonik, sql}) => {
            await slonik.query(sql\`raise 'up migration not implemented'\`)
          }

          export const down: Migration = async ({slonik, sql}) => {
            await slonik.query(sql\`raise 'down migration not implemented'\`)
          }
        `,
      ],
    ],
    '.js': [
      [
        filepath,
        dedent`
          exports.up = async ({slonik, sql}) => {
            await slonik.query(sql\`raise 'up migration not implemented'\`)
          }

          exports.down = async ({slonik, sql}) => {
            await slonik.query(sql\`raise 'down migration not implemented'\`)
          }
        `,
      ],
    ],
  }

  return templates[path.extname(filepath)] || []
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
  /**
   * OPTIONAL "module" value. If you set `mainModule: module` in a nodejs script, that script will become a
   * runnable CLI when invoked directly, but the migrator object can still be imported as normal if a different
   * entrypoint is used.
   */
  mainModule?: NodeModule
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

export const sqlResolver: umzug.Resolver<SlonikMigratorContext> = params => ({
  name: params.name,
  path: params.path,
  up: async ({path, context}) => {
    await context!.transaction.query(rawQuery(readFileSync(path!, 'utf8')))
  },
  down: async ({path, context}) => {
    const downPath = join(dirname(path!), 'down', basename(path!))
    await context!.transaction.query(rawQuery(readFileSync(downPath, 'utf8')))
  },
})

export const umzugResolver: umzug.Resolver<SlonikMigratorContext> = params => {
  if (path.extname(params.name) === '.sql') {
    return sqlResolver(params)
  }
  const {transaction: slonik} = params.context
  const migrationModule = require(params.path!)
  return {
    name: params.name,
    path: params.path,
    up: upParams => migrationModule.up({slonik, sql, ...upParams}),
    down: downParams => migrationModule.down({slonik, sql, ...downParams}),
  }
}

/**
 * Narrowing of @see umzug.UmzugOptions where the migrations input type specifically,, uses `glob`
 */
export type SlonikUmzugOptions = umzug.UmzugOptions<SlonikMigratorContext> & {
  migrations: umzug.GlobInputMigrations<SlonikMigratorContext>
}

/**
 * Get umzug constructor options. This is called by `setupSlonikMigrator`, but to tweak the umzug constructor
 * options, this can be called directly and customised.
 */
export const getUmzugOptions = (slonikMigratorOptions: SlonikMigratorOptions): SlonikUmzugOptions => {
  return {
    context: {
      parent: slonikMigratorOptions.slonik,
      sql,
      commit: null as never, // commit function is added later by storage setup.
      transaction: null as never, // commit function is added later by storage setup.
    },
    migrations: {
      glob: ['./*.{js,ts,sql}', {cwd: path.resolve(slonikMigratorOptions.migrationsPath)}],
      resolve: umzugResolver,
    },
    storage: getStorage(slonikMigratorOptions),
    logger: slonikMigratorOptions.logger,
    create: {
      template,
      folder: path.resolve(slonikMigratorOptions.migrationsPath),
    },
  }
}

/**
 * Default umzug `resolve` function for migrations. Runs sql files as queries, and executes `up` and `down`
 * exports of javascript/typescript files, passing params `{slonik sql}`
 */
export const slonikMigrationResolver: umzug.Resolver<SlonikMigratorContext> = params => {
  if (path.extname(params.name) === '.sql') {
    return sqlResolver(params)
  }
  const {transaction} = params.context
  const migrationModule = require(params.path!)
  return {
    name: params.name,
    path: params.path,
    up: upParams => migrationModule.up({slonik: transaction, sql, ...upParams}),
    down: downParams => migrationModule.down({slonik: transaction, sql, ...downParams}),
  }
}

/**
 * Returns @see umzug.Umzug instance.
 */
export const setupSlonikMigrator = (options: SlonikMigratorOptions) => {
  const migrator = new umzug.Umzug(getUmzugOptions(options))
  const hooks = getHooks(options)
  migrator.on('beforeAll', hooks.setup)
  migrator.on('afterAll', hooks.teardown)
  if (options.mainModule === require.main) {
    migrator.runAsCLI().then(() => options.slonik.end())
  }
  return migrator
}
