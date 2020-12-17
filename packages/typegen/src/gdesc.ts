import * as glob from 'glob'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as execa from 'execa'
import * as lodash from 'lodash'
import * as fp from 'lodash/fp'
import {fsSyncer} from 'fs-syncer'

export interface GdescriberParams {
  /**
   * How to execute `psql` from the machine running this tool. e.g. `docker-compose exec -T postgres psql`.
   * Note: It's recommended to only run this against a local/dev/CI database, not production!
   */
  psqlCommand: string

  /**
   * Auth string for passing to the `psql` command. e.g. `-h localhost -U postgres postgres`
   * Note: It's recommended to only run this against a local/dev/CI database, not production!
   */
  psqlAuth: string

  /**
   * Files to look for SQL queries in. e.g. `source/queries/*.ts`
   * Also allows passing `cwd` and `ignore` strings e.g. `['source/*.ts', {ignore: ['source/*.test.ts']}]`
   * Defaults to all JavaScript and TypeScript files, ignoring node_modules.
   */
  glob: string | [string, {cwd?: string; ignore?: string[]}]

  /**
   * Map from a psql type description to a TypeScript type representation.
   * @default @see defaultGdescTypeMappings
   */
  gdescTypeMappings: Record<string, string>

  /**
   * TypeScript type when no mapping is found. This should usually be `unknown` or `any`
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
   * There is no edge-case handling for queries which contain backticks. If you have those, pass a custom function in here or raise an issue.
   */
  extractQueries: (file: string) => Array<{tag: string; file: string; sql: string}>

  /**
   * How to write types which have been collected by psql. Usually you'll want to write to disk, but this can be any side-effect.
   * You could write to stdout instead, or throw an error if any new types are detected in CI. In theory you could event use this
   * to write some code in another language instead.
   * @default @see defaultWriteTypes
   */
  writeTypes: (types: Record<string, QueryType[]>) => void
}

export interface QueryType {
  /** Tag for the type. Usually this corresponds to an interface name for the query type */
  tag: string
  /** Path to file containing the query, relative to cwd */
  file: string
  /** Query SQL */
  sql: string
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

export const defaultGdescTypeMappings = {
  text: 'string',
  integer: 'number',
  boolean: 'boolean',
  json: 'any',
  jsonb: 'any',
  name: 'string',
  'double precision': 'number',
  'character varying': 'string',
  'timestamp with time zone': 'number',
}

export const psqlRows = (output: string) => {
  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.match(/^\(\d+ rows?\)$/))

  const start = lines.findIndex(row => {
    const dividers = row.split('+')
    return dividers.length > 0 && dividers.every(d => d.match(/^-+$/))
  })

  if (start === -1) {
    throw new Error(`Unexpected psql table format:\n${output}`)
  }

  return lines.slice(start + 1).map(row => row.split('|').map(cell => cell.trim()))
}

export const defaultExtractQueries: GdescriberParams['extractQueries'] = file => {
  const content = fs.readFileSync(file).toString()
  return content
    .replace(/sql\.(\w+)`/g, 'start_marker:$1`')
    .split('start_marker:')
    .slice(1)
    .map(sqlPlusCruft => sqlPlusCruft.split('`'))
    .map(([tag, sql]) => ({file, tag, sql: normaliseSQL(sql, os.EOL)}))
}

export const defaultWriteTypes = (folder: string): GdescriberParams['writeTypes'] => groups => {
  const typeFiles = lodash
    .chain(groups)
    .mapKeys((val, key) => lodash.camelCase(key))
    .mapKeys((val, typeName) => typeName.slice(0, 1).toUpperCase() + typeName.slice(1))
    .mapValues(
      fp.uniqBy(q => {
        const stringified = q.fields.map(f => JSON.stringify(f))
        return stringified.sort().join(',')
      }),
    )
    .mapValues((queries, typeName) => {
      const interfaces = queries.map(
        (q, i) =>
          `export interface ${typeName}_${i} {
            query: ${JSON.stringify(q.sql)}
            file: ${JSON.stringify(q.file)}
            fields: {
              ${q.fields.map(
                f => `
                /** postgres type: ${f.gdesc} */
                ${f.name}: ${f.typescript}
              `,
              )}
            }
          }`,
      )

      const unionType = queries.map((q, i) => `${typeName}_${i}['fields']`).join(' | ')

      return `
        export type ${typeName}_Type = ${unionType}

        export type ${typeName} = {
          [K in keyof ${typeName}_Type]: ${typeName}_Type[K]
        }

        ${interfaces.join(os.EOL + os.EOL)}
      `
    })
    .mapKeys((typescript, name) => 'types/' + name + '.ts')
    .value()

  const names = Object.keys(typeFiles).map(filepath => path.parse(filepath).name)
  let allFiles: Record<string, string> = {
    ...typeFiles,
    'index.ts': `
      import * as slonik from 'slonik'

      ${names.map(n => `import { ${n} } from './types/${n}'`).join(os.EOL)}

      export interface GenericSqlTaggedTemplateType<T> {
        <U = T>(
          template: TemplateStringsArray,
          ...vals: slonik.ValueExpressionType[]
        ): slonik.TaggedTemplateLiteralInvocationType<U>;
      }
      
      export type SqlType = typeof slonik.sql & {
        ${names.map(n => `${n}: GenericSqlTaggedTemplateType<${n}>`)}
      };
      
      export const sql: SqlType = Object.assign(
        (...args: Parameters<typeof slonik.sql>): ReturnType<typeof slonik.sql> => slonik.sql(...args),
        slonik.sql,
        {
          ${names.map(n => `${n}: slonik.sql`)}
        }
      )
    `,
  }

  console.log({allFiles})

  try {
    const prettier: typeof import('prettier') = require('prettier')
    allFiles = lodash.mapValues(allFiles, (content, filepath) => prettier.format(content, {filepath}))
  } catch (e) {
    console.warn(`prettier failed; your output will be very ugly! Error: ${e.message}`)
  }

  fsSyncer(folder, allFiles).sync()
}

/** very dumb function which cleans up sql queries */
const normaliseSQL = (sql: string, newlineReplacement = ' ') => {
  return sql
    .replace(/\r?\n/g, newlineReplacement)
    .replace(/\${.*?}/g, '$1')
    .trim()
    .replace(/[\t ]+/g, ' ')
}

export const gdescriber = ({
  psqlCommand = `docker-compose exec -T postgres psql -h localhost -U postgres postgres`,
  gdescTypeMappings = defaultGdescTypeMappings,
  glob: globParams = ['**/*.{js,ts,cjs,mjs}', {ignore: ['node_modules/**']}],
  defaultType = 'unknown',
  extractQueries = defaultExtractQueries,
  writeTypes = defaultWriteTypes('src/generated/db'),
}: Partial<GdescriberParams> = {}) => {
  if (psqlCommand.includes(`'`)) {
    throw new Error(`Can't run psql command '${psqlCommand}'; it has quotes in it.`)
  }

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

  const psql = async (query: string) => {
    query = normaliseSQL(query)
    const command = `echo '${query.replace(/'/g, `'"'"'`)}' | ${psqlCommand} -f -`
    const result = await execa('sh', ['-c', command])
    try {
      return psqlRows(result.stdout)
    } catch (e) {
      const stdout = result.stdout || result.stderr
      e.message = `Error with query ${JSON.stringify(query)}, result: ${JSON.stringify(stdout)}: ${e.message}`
      throw e
    }
  }

  const describeCommand = async (query: string): Promise<QueryField[]> => {
    return parseGdescOutput(await psql(`${query} \\gdesc`))
  }

  const parseGdescOutput = async (rows: string[][]): Promise<QueryField[]> => {
    return Promise.all(
      rows.map(async row => ({
        name: row[0],
        gdesc: row[1],
        typescript: await gdescToTypeScript(row[1]),
      })),
    )
  }

  const gdescToTypeScript = async (gdescType?: string): Promise<string> => {
    const enumTypes = await getEnumTypes()
    if (gdescType?.endsWith('[]')) {
      return `Array<${gdescToTypeScript(gdescType.slice(0, -2))}>`
    }
    if (gdescType?.match(/\(\d+\)/)) {
      return gdescToTypeScript(gdescType.split('(')[0])
    }
    const typescriptType =
      (gdescType && gdescType in gdescTypeMappings
        ? gdescTypeMappings[gdescType]
        : enumTypes[gdescType!]?.map(t => t.enumlabel).join(' | ')) || defaultType

    if (typescriptType === 'any' || typescriptType === 'unknown') {
      return `${typescriptType} /* ${gdescType} */`
    }
    return typescriptType
  }

  const findAll = async () => {
    const globParamsArray: Parameters<typeof glob.sync> = typeof globParams === 'string' ? [globParams] : globParams
    const promises = glob
      .sync(...globParamsArray)
      .flatMap(extractQueries)
      .map<Promise<QueryType>>(async query => ({...query, fields: await describeCommand(query.sql)}))

    const queries = lodash.groupBy(await Promise.all(promises), q => q.tag)

    return writeTypes(queries)
  }

  return {findAll}
}
