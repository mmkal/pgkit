import {createHash} from 'crypto'
import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'fs'
import {once} from 'lodash'
import {basename, dirname, join} from 'path'
import * as Umzug from 'umzug'
import {sql, DatabasePoolType} from 'slonik'

export interface SlonikMigratorOptions {
  slonik: DatabasePoolType
  migrationsPath: string
  migrationTableName?: string
  log?: typeof console.log
  args?: string[]
  mainModule?: NodeModule
}

export interface Migration {
  file: string
  path: string
}

export interface SlonikMigrator {
  up(migration?: string): Promise<Migration[]>
  down(migration?: string): Promise<Migration[]>
  create(migration: string): void
}

const defaultArgs = process.argv.slice(2)
export const setupSlonikMigrator = ({
  slonik,
  migrationsPath,
  migrationTableName = 'migration',
  log: _log = console.log,
  args = defaultArgs,
  mainModule,
}: SlonikMigratorOptions) => {
  const log: typeof _log = (...args: any[]) => {
    if (args[0] === 'File: down does not match pattern: /\\.sql$/') {
      // workaround until release of https://github.com/sequelize/umzug/pull/190
      return
    }
    return _log(...args)
  }
  const createMigrationTable = once(async () => {
    void await slonik.query(sql`
      create table if not exists ${sql.identifier([migrationTableName])}(
        name text primary key,
        hash text not null,
        date timestamptz not null default now()
      )
    `)
  })
  const hash = (migrationName: string) => createHash('md5')
    .update(readFileSync(join(migrationsPath, migrationName), 'utf8').trim().replace(/\s+/g, ' '))
    .digest('hex')
    .slice(0, 10)
  const umzug = new Umzug({
    logging: log,
    migrations: {
      path: migrationsPath,
      pattern: /\.sql$/,
      customResolver: path => ({
        up: () => slonik.query(sql`${sql.raw(readFileSync(path, 'utf8'))}`),
        down: async () => {
          const downPath = join(dirname(path), 'down', basename(path))
          await slonik.query(sql`${sql.raw(readFileSync(downPath, 'utf8'))}`)
        },
      }),
    },
    storage: {
      async executed() {
        await createMigrationTable()
        return slonik
          .any(sql`select name, hash from migration`)
          .then(migrations => {
            log('migrations executed:', migrations)
            return migrations
          })
          .then(migrations => migrations.map(r => {
            const name = r.name as string
            /* istanbul ignore if */
            if (r.hash !== hash(name)) {
              log(
                `warning:`,
                `hash in migration table didn't match content on disk.`,
                `did you try to change a migration file after it had been run?`,
                {migration: r.name, dbHash: r.hash, diskHash: hash(name)}
              )
            }
            return name
          }))
      },
      async logMigration(name: string) {
        await createMigrationTable()
        await slonik
          .query(sql`insert into migration(name, hash) values (${name}, ${hash(name)})`)
      },
      async unlogMigration(name: string) {
        await createMigrationTable()
        await slonik
          .query(sql`delete from migration where name = ${name}`)
      }
    },
  })

  const migrator = {
    up: (name?: string) => umzug.up(name),
    down: (name?: string) => umzug.down(name),
    create: (name: string) => {
      const timestamp = new Date().toISOString().replace(/\W/g, '-').replace(/-\d\d-\d\d\dZ/, '')
      const sqlFileName = `${timestamp}.${name}.sql`
      const downDir = join(migrationsPath, 'down')
      mkdirSync(downDir, {recursive: true})
      writeFileSync(join(migrationsPath, sqlFileName), `--${name} (up)\n`, 'utf8')
      writeFileSync(join(downDir, sqlFileName), `--${name} (down)\n`, 'utf8')
    },
  }
  const [command, name] = args
  /* istanbul ignore if */
  if (require.main === mainModule) {
    command in migrator && (migrator as any)[command](name)
  }

  return migrator
}
