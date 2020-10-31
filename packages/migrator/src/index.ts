import {createHash} from 'crypto'
import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'fs'
import {once, memoize} from 'lodash'
import {basename, dirname, join, extname} from 'path'
import {Umzug} from 'umzug'
import {sql, DatabasePoolType} from 'slonik'
import {inspect} from 'util'
import * as dedent from 'dedent'
import {EOL} from 'os'

export const supportedExtensions = ['sql', 'js', 'ts'] as const

export type SupportedExtension = typeof supportedExtensions[number]

export interface SlonikMigratorOptions {
  slonik: DatabasePoolType
  migrationsPath: string
  migrationTableName?: string | string[]
  log?: typeof console.log
  args?: string[]
  mainModule?: NodeModule
}

export interface MigrationParams {
  path: string
  slonik: DatabasePoolType
  sql: typeof sql
}

export type Migration = (params: MigrationParams) => Promise<unknown>

export interface MigrationResult {
  name: string
  path?: string
}

export interface SlonikMigratorCLI {
  up(to?: string): Promise<MigrationResult[]>
  down(to?: string): Promise<MigrationResult[]>
  pending(): Promise<MigrationResult[]>
  executed(): Promise<MigrationResult[]>
  create(name: string): string
}

/** @private not meant for general use, since this is coupled to @see umzug */
type GetUmzugResolver = (
  params: MigrationParams,
) => {
  up: () => Promise<unknown>
  down?: () => Promise<unknown>
}

const scriptResolver: GetUmzugResolver = params => {
  const exportedMigrations: {up: Migration; down?: Migration} = require(params.path)
  return {
    up: () => exportedMigrations.up(params),
    down: exportedMigrations.down && (() => exportedMigrations.down!(params)),
  }
}

// safer than slonik-sql-tag-raw: https://github.com/gajus/slonik-sql-tag-raw/issues/6
const rawQuery = (query: string): ReturnType<typeof sql> => ({
  type: 'SLONIK_TOKEN_SQL',
  sql: query,
  values: [],
})

const sqlResolver: GetUmzugResolver = ({path, slonik, sql}) => ({
  up: () => slonik.query(rawQuery(readFileSync(path, 'utf8'))),
  down: async () => {
    const downPath = join(dirname(path), 'down', basename(path))
    await slonik.query(rawQuery(readFileSync(downPath, 'utf8')))
  },
})

export const defaultResolvers = {
  sql: sqlResolver,
  js: scriptResolver,
  ts: scriptResolver,
}

export const setupSlonikMigrator = ({
  slonik,
  migrationsPath,
  migrationTableName = 'migration',
  log = memoize(console.log, JSON.stringify),
  mainModule,
}: SlonikMigratorOptions) => {
  const migrationTableNameIdentifier = sql.identifier(
    Array.isArray(migrationTableName) ? migrationTableName : [migrationTableName],
  )

  const migrationResolver: GetUmzugResolver = params => {
    const ext = params.path.split('.').slice(-1)[0] as SupportedExtension
    return defaultResolvers[ext](params)
  }
  const createMigrationTable = once(async () => {
    void (await slonik.query(sql`
      create table if not exists ${migrationTableNameIdentifier}(
        name text primary key,
        hash text not null,
        date timestamptz not null default now()
      )
    `))
  })
  const hash = (migrationName: string) =>
    createHash('md5')
      .update(readFileSync(join(migrationsPath, migrationName), 'utf8').trim().replace(/\s+/g, ' '))
      .digest('hex')
      .slice(0, 10)

  const umzug = new Umzug({
    logger: {
      info: log,
      warn: log,
      error: log,
    },
    migrations: {
      glob: ['*.{sql,js,ts}', {cwd: migrationsPath}],
      resolve: ({path, name}) => ({
        name,
        path,
        ...migrationResolver({path: path!, slonik, sql}),
      }),
    },
    storage: {
      async executed() {
        await createMigrationTable()
        return slonik
          .any(sql`select name, hash from ${migrationTableNameIdentifier}`)
          .then(migrations => {
            log('migrations in database:', migrations)
            return migrations
          })
          .then(migrations =>
            migrations.map(r => {
              const name = r.name as string
              /* istanbul ignore if */
              if (r.hash !== hash(name)) {
                log(
                  `warning:`,
                  `hash in '${migrationTableName}' table didn't match content on disk.`,
                  `did you try to change a migration file after it had been run?`,
                  {migration: r.name, dbHash: r.hash, diskHash: hash(name)},
                )
              }
              return name
            }),
          )
      },
      async logMigration(name: string) {
        await createMigrationTable()
        await slonik.query(sql`
            insert into ${migrationTableNameIdentifier}(name, hash)
            values (${name}, ${hash(name)})
          `)
      },
      async unlogMigration(name: string) {
        await createMigrationTable()
        await slonik.query(sql`
            delete from ${migrationTableNameIdentifier}
            where name = ${name}
          `)
      },
    },
  })

  const templates = (name: string) => ({
    sql: {
      up: `--${name} (up)`,
      down: `--${name} (down)`,
    },
    ts: {
      up: dedent`
        import {Migration} from '@slonik/migrator'

        export const up: Migration = ({slonik, sql}) => slonik.query(sql\`select true\`)
        export const down: Migration = ({slonik, sql}) => slonik.query(sql\`select true\`)
      `,
      down: null,
    },
    js: {
      up: dedent`
        exports.up = ({slonik, sql}) => slonik.query(sql\`select true\`)
        exports.down = ({slonik, sql}) => slonik.query(sql\`select true\`)
      `,
      down: null,
    },
  })

  const migrator: SlonikMigratorCLI = {
    up: to => (to ? umzug.up({to}) : umzug.up()),
    down: to => (to === '0' ? umzug.down({to: 0}) : to ? umzug.down({to}) : umzug.down()),
    pending: () => umzug.pending(),
    executed: () => umzug.executed(),
    create: (nameWithExtension: string) => {
      const explicitExtension = supportedExtensions.find(ex => extname(nameWithExtension) === `.${ex}`)
      const name = explicitExtension
        ? nameWithExtension.slice(0, nameWithExtension.lastIndexOf(`.${explicitExtension}`))
        : nameWithExtension

      const extension =
        explicitExtension ||
        readdirSync(migrationsPath)
          .reverse()
          .map(filename => supportedExtensions.find(ex => extname(filename) === `.${ex}`))
          .find(Boolean) ||
        'sql'

      const timestamp = new Date()
        .toISOString()
        .replace(/\W/g, '-')
        .replace(/-\d\d\dZ/, '')

      const filename = `${timestamp}.${name}.${extension}`
      const downDir = join(migrationsPath, 'down')
      const {up, down} = templates(name)[extension as SupportedExtension]

      const upPath = join(migrationsPath, filename)
      writeFileSync(upPath, up + EOL, 'utf8')

      if (down) {
        mkdirSync(downDir, {recursive: true})
        writeFileSync(join(downDir, filename), down + EOL, 'utf8')
      }

      return upPath
    },
  }
  /* istanbul ignore if */
  if (require.main === mainModule) {
    const [command, name] = process.argv.slice(2)
    if (command in migrator) {
      ;(async () => {
        const result = await migrator[command as keyof SlonikMigratorCLI](name)
        if (command === 'pending' || command === 'executed') log(`${command}:`, result)
        await slonik.end()
      })()
    } else {
      const info = {'commands available': Object.keys(migrator), 'command from cli args': command}
      throw `command not found. ${inspect(info, {breakLength: Infinity})}`
    }
  }

  return migrator
}
