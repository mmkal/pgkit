import * as lodash from 'lodash'
import {defaultExtractQueries} from './extract'
import {defaultWriteTypes} from './write'
import {defaultGdescTypeMappings, psqlClient} from './pg'
import {globAsync} from './util'

export interface GdescriberParams {
  /**
   * How to execute `psql` from the machine running this tool.
   *
   * Note: It's not recommended to run this tool against a production database, even though it doesn't perform any dynamic queries.
   *
   * Some example values:
   *
   * Scenario                             | Command
   * -------------------------------------|-------------------------------------------------------------------------
   * running postgres directly            | `psql -h localhost -U postgres postgres`
   * running postgres with docker-compose | `docker-compose exec -T postgres psql -h localhost -U postgres postgres`
   *
   * ___
   *
   * You can test this by running `echo 'select 123' | ${your_psqlCommand} -f -`
   *
   * e.g. `echo 'select 1 as a, 2 as b' | docker-compose exec -T postgres psql -h localhost -U postgres postgres -f -`
   *
   * You should see something like this printed:
   *
   * ```
   *  a | b
   * ---+---
   *  1 | 2
   * (1 row)
   * ```
   */
  psqlCommand: string

  /**
   * Files to look for SQL queries in. e.g. `source/queries/*.ts`
   * Also allows passing `cwd` and `ignore` strings e.g. `['source/*.ts', {ignore: ['source/*.test.ts']}]`
   * Defaults to all JavaScript and TypeScript files, ignoring node_modules.
   */
  glob: string | [string, {cwd?: string; ignore?: string[]}?]

  /**
   * Map from a psql type description to a TypeScript type representation.
   * @default @see defaultGdescTypeMappings
   */
  gdescToTypeScript: (gdesc: string, typeName: string) => string | undefined

  /**
   * TypeScript type when no mapping is found. This should usually be `unknown` (or `any` if you like to live dangerously).
   */
  defaultType: string

  /**
   * How to parse a file to get a list of SQL queries. By default, reads the file and uses naive regexes to
   * search for blocks looking like
   * @example
   * ```
   * pool.query(sql.SomeType`
   *   select foo
   *   from bar
   * `)
   * ```
   *
   * Which will parse to:
   *
   * ```
   * {tag: 'SomeType', file: 'path/to/file.ts', sql: 'select foo from bar'}
   * ```
   *
   * ___
   *
   * Tries to use typescript to parse input files and search for template tag expressions, and falls back to using naive regexes if
   * typescript isn't installed. Installing typescript will make the parsing more resilient to unusually-formatted queries with backticks
   * and/or nested template expressions.
   */
  extractQueries: (file: string) => Array<ExtractedQuery>

  /**
   * How to write types which have been collected by psql. Usually you'll want to write to disk, but this can be any side-effect.
   * You could write to stdout instead, or throw an error if any new types are detected in CI. In theory you could event use this
   * to write some code in another language instead.
   * @default @see defaultWriteTypes
   */
  writeTypes: (types: Record<string, DescribedQuery[]>) => void
}

export interface ExtractedQuery {
  /** Tag for the type. Usually this corresponds to an interface name for the query type */
  tag: string
  /** Path to file containing the query, relative to cwd */
  file: string
  /** Query SQL */
  sql: string
}

export interface DescribedQuery extends ExtractedQuery {
  /** List of meta objects with info about field types returned by this query */
  fields: QueryField[]
}

export interface QueryField {
  /** Field name. e.g. for `select foo, bar from baz` this will be `foo` or `bar` */
  name: string
  /** The description column returned by `psql ... \gdesc`. See https://www.postgresql.org/docs/11/app-psql.html  */
  gdesc: string
  /** The generated typescript type. based on `gdesc` */
  typescript: string
}

export const gdescriber = ({
  psqlCommand = `docker-compose exec -T postgres psql -h localhost -U postgres postgres`,
  gdescToTypeScript = gdesc => defaultGdescTypeMappings[gdesc],
  glob = ['**/*.{js,ts,cjs,mjs}', {ignore: ['node_modules/**', '**/generated/**']}],
  defaultType = 'unknown',
  extractQueries = defaultExtractQueries,
  writeTypes = defaultWriteTypes('src/generated/db'),
}: Partial<GdescriberParams> = {}) => {
  if (psqlCommand.includes(`'`)) {
    throw new Error(`Can't run psql command '${psqlCommand}'; it has quotes in it.`)
  }

  const psql = psqlClient(psqlCommand)

  const getEnumTypes = lodash.once(async () => {
    const rows = await psql(`
      select distinct t.typname, e.enumlabel
      from pg_enum as e
      join pg_type as t
      on t.oid = e.enumtypid
    `)
    const types = rows.map(r => ({typname: r[0], enumlabel: r[1]}))
    return lodash.groupBy(types, t => t.typname)
  })

  const describeCommand = async (query: string): Promise<QueryField[]> => {
    const rows = await psql(`${query} \\gdesc`)
    return Promise.all(
      rows.map(async row => ({
        name: row[0],
        gdesc: row[1],
        typescript: await getTypeScriptType(row[1], row[0]),
      })),
    )
  }

  const getTypeScriptType = async (gdescType: string, typeName: string): Promise<string> => {
    if (!gdescType) {
      return defaultType
    }
    const enumTypes = await getEnumTypes()
    if (gdescType?.endsWith('[]')) {
      return `Array<${getTypeScriptType(gdescType.slice(0, -2), typeName)}>`
    }
    if (gdescType?.match(/\(\d+\)/)) {
      return getTypeScriptType(gdescType.split('(')[0], typeName)
    }

    return (
      gdescToTypeScript(gdescType, typeName) ||
      enumTypes[gdescType]?.map(t => JSON.stringify(t.enumlabel)).join(' | ') ||
      defaultGdescTypeMappings[gdescType] ||
      defaultType
    )
  }

  const findAll = async () => {
    const globParams: Parameters<typeof globAsync> = typeof glob === 'string' ? [glob] : glob
    const files = await globAsync(...globParams)
    const promises = files
      .flatMap(extractQueries)
      .map<Promise<DescribedQuery>>(async query => ({...query, fields: await describeCommand(query.sql)}))

    const queries = lodash.groupBy(await Promise.all(promises), q => q.tag)

    return writeTypes(queries)
  }

  return findAll()
}
