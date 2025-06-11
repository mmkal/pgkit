import {Client, createClient, sql} from '@pgkit/client'
import * as fs from 'fs'
import {kebabCase} from 'lodash'
import * as path from 'path'
import * as sqlFormatter from 'sql-formatter'
import {type MigraOptions} from '../src/command'

export const format = (query: string) => {
  try {
    return sqlFormatter.format(query, {language: 'postgresql'})
  } catch (e) {
    // sql-formatter errors are huge and not helpful at all. also callstacks are useless
    // I think they use nearley like pgsql-ast-parser does, which produces very verbose "Instead, I was expecting to see one of the following" errors
    const shortError = String(e).split('\n').at(0)
    throw new Error(`Couldn't format query, did you pass something other than valid SQL? ${query}: ${shortError}`)
  }
}

const argsMap: Record<string, MigraOptions> = {
  singleschema: {schema: 'goodschema'},
  excludeschema: {excludeSchema: 'excludedschema'},
  singleschema_ext: {createExtensionsOnly: true},
  extversions: {ignoreExtensionVersions: false},
}

export const createDB = async (url: string, admin: Client, prefix: string) => {
  const db = url.split('/').at(-1)
  const variant = db.split('_').at(-1)
  const name = db.replace(prefix + '_', '').slice(0, -1 - variant.length)

  const connectionString = url.toString()

  if (process.env.MIGRA_CACHE) {
    return
  }

  await admin.query(sql`drop database if exists ${sql.identifier([db])}`)
  await admin.query(sql`create database ${sql.identifier([db])}`)

  const pool = createClient(connectionString)
  return {connectionString, pool, name, variant}
}

export const setup = async (url: string, admin: Client, prefix: string, fixturesDir: string) => {
  const {pool, name, variant} = await createDB(url, admin, prefix)
  const filepath = path.join(fixturesDir, name, `${variant}.sql`)
  const query = fs.readFileSync(filepath, 'utf8')

  const exists = await pool.oneFirst<{exists: boolean}>(
    sql`select exists(select 1 from pg_catalog.pg_roles where rolname = 'schemainspect_test_role')`,
  )
  if (!exists) await pool.query(sql`create role schemainspect_test_role`)

  await pool.query(sql.raw(query))

  await pool.pgp.$pool.end()
}

export const getFixtures = (prefix: string, fixturesDir: string) => {
  const fixtureNames = fs.readdirSync(fixturesDir)
  return fixtureNames.map(name => {
    const variant = (ab: 'a' | 'b', admin: Client) =>
      admin.connectionString().replace(/postgres$/, `${prefix}_${name}_${ab}`)
    const args: MigraOptions = {
      unsafe: true,
      ignoreExtensionVersions: true,
      ...(name in argsMap && argsMap[name]),
    }
    const variants = (admin: Client) => [variant('a', admin), variant('b', admin)] as const
    return {
      name,
      variants,
      setup: async (admin: Client) => {
        const [a, b] = variants(admin)
        await setup(a, admin, prefix, fixturesDir)
        await setup(b, admin, prefix, fixturesDir)
        return [a, b] as const
      },
      args: (overrides?: Partial<typeof args>) => ({...args, ...overrides}),
      cliArgs: (overrides?: Partial<typeof args>) => {
        const entries = Object.entries({...args, ...overrides})
        return entries.flatMap(([k, v]) => {
          const arg = `--${kebabCase(k)}`
            // https://github.com/djrobstep/migra/pull/235
            .replace(/exclude-schema/, 'exclude_schema')
          if (v === false) return []
          if (v === true) return [arg]
          return [arg, v]
        })
      },
    } as const
  })
}
