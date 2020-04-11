import {createHash} from 'crypto'
import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'fs'
import {once, memoize} from 'lodash'
import {map, pick} from 'lodash/fp'
import {basename, dirname, join, extname} from 'path'
import * as Umzug from 'umzug'
import {sql, DatabasePoolType} from 'slonik'
import {raw} from 'slonik-sql-tag-raw'
import {inspect} from 'util'
import * as dedent from 'dedent'
import {EOL} from 'os'

export const supportedExtensions = ['sql', 'js', 'ts'] as const

export type SupportedExtension = typeof supportedExtensions[number]

export interface SlonikMigratorOptions {
  slonik: DatabasePoolType
  migrationsPath: string
  migrationTableName?: string
  log?: typeof console.log
  args?: string[]
  mainModule?: NodeModule
}

export interface MigrationParams {
  path: string
  slonik: DatabasePoolType
  sql: typeof sql
}

export type Migration = (params: MigrationParams) => PromiseLike<unknown>

export interface MigrationResult {
  file: string
  path: string
}

export interface SlonikMigratorCLI {
  up(migration?: string): Promise<MigrationResult[]>
  down(migration?: string): Promise<MigrationResult[]>
  create(migration: string): string
}

/** @private not meant for general use, since this is coupled to @see umzug */
type GetUmzugResolver = (
  params: MigrationParams,
) => {
  up: () => PromiseLike<unknown>
  down?: () => PromiseLike<unknown>
}

const scriptResolver: GetUmzugResolver = params => {
  const exportedMigrations: {up: Migration; down?: Migration} = require(params.path)
  return {
    up: () => exportedMigrations.up(params),
    down: exportedMigrations.down && (() => exportedMigrations.down!(params)),
  }
}

const sqlResolver: GetUmzugResolver = ({path, slonik, sql}) => ({
  up: () => slonik.query(sql`${raw(readFileSync(path, 'utf8'))}`),
  down: async () => {
    const downPath = join(dirname(path), 'down', basename(path))
    await slonik.query(sql`${raw(readFileSync(downPath, 'utf8'))}`)
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
  const migrationResolver: GetUmzugResolver = params => {
    const ext = params.path.split('.').slice(-1)[0] as SupportedExtension
    return defaultResolvers[ext](params)
  }
  const createMigrationTable = once(async () => {
    void (await slonik.query(sql`
      create table if not exists ${sql.identifier([migrationTableName])}(
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
    logging: log,
    migrations: {
      path: migrationsPath,
      pattern: /\.(sql|js|ts)$/,
      customResolver: path => migrationResolver({path, slonik, sql}),
    },
    storage: {
      async executed() {
        await createMigrationTable()
        return slonik
          .any(sql`select name, hash from ${sql.identifier([migrationTableName])}`)
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
            insert into ${sql.identifier([migrationTableName])}(name, hash)
            values (${name}, ${hash(name)})
          `)
      },
      async unlogMigration(name: string) {
        await createMigrationTable()
        await slonik.query(sql`
            delete from ${sql.identifier([migrationTableName])}
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
    up: (name?: string) => umzug.up(name).then(map(pick(['file', 'path']))),
    down: (name?: string) => umzug.down(name).then(map(pick(['file', 'path']))),
    create: (nameAndExtensions: string) => {
      const explicitExtension = supportedExtensions.find(ex => extname(nameAndExtensions) === `.${ex}`)
      const name = explicitExtension
        ? nameAndExtensions.slice(0, nameAndExtensions.lastIndexOf(`.${explicitExtension}`))
        : nameAndExtensions

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
        .replace(/-\d\d-\d\d\dZ/, '')

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
      migrator[command as keyof SlonikMigratorCLI](name)
    } else {
      const info = {'commands available': Object.keys(migrator), 'command from cli args': command}
      throw `command not found. ${inspect(info, {breakLength: Infinity})}`
    }
  }

  return migrator
}
