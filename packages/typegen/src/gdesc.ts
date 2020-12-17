import * as glob from 'glob'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import * as execa from 'execa'
import * as lodash from 'lodash'
import * as fp from 'lodash/fp'
import {fsSyncer} from 'fs-syncer'

export interface GdescriberParams {
  psqlCommand: string
  psqlAuth: string
  glob: string | [string, {cwd?: string; ignore?: string[]}]
  gdescTypeMappings: Record<string, string>
  defaultType: string
  extractQueries: (file: string) => Array<{tag: string; file: string; sql: string}>
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
    .mapValues(
      fp.uniqBy(q => {
        const stringified = q.fields.map(f => JSON.stringify(f))
        return stringified.sort().join(',')
      }),
    )
    .mapValues((queries, typeName) => {
      typeName = typeName.slice(0, 1).toUpperCase() + typeName.slice(1)
      const interfaces = queries.map(
        (q, i) =>
          `export interface ${typeName}_${i} {
            query: ${JSON.stringify(q.sql)}
            file: ${JSON.stringify(q.file)}
            fields: {
              ${q.fields.map(
                f => `
                /** ${f.gdesc} */
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
    .mapKeys((typescript, name) => name + '.ts')
    .value()

  const barrelExports = Object.keys(typeFiles)
    .map(name => path.parse(name).base)
    .map(base => `export * from './${base}`)

  let allFiles: Record<string, string> = {
    ...typeFiles,
    'index.ts': barrelExports.join(os.EOL),
  }

  try {
    const prettier: typeof import('prettier') = require('prettier')
    allFiles = lodash.mapValues(allFiles, (content, filepath) => prettier.format(content, {filepath}))
  } catch (e) {
    console.warn(`prettier failed; your output will work but be very ugly! Install prettier to fix this`)
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
  psqlCommand = `docker-compose exec -T postgres psql`,
  psqlAuth = `-h localhost -U postgres postgres`,
  gdescTypeMappings = defaultGdescTypeMappings,
  glob: globParams = ['**/*.{js,ts,cjs,mjs}', {ignore: ['node_modules/**']}],
  defaultType = 'unknown',
  extractQueries = defaultExtractQueries,
  writeTypes = defaultWriteTypes('src/generated/pg-types'),
}: Partial<GdescriberParams> = {}) => {
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
    const command = `echo '${query.replace(/'/g, `'"'"'`)}' | ${psqlCommand} ${psqlAuth} -f -`
    if (`${psqlCommand} ${psqlAuth}`.includes(`'`)) {
      throw new Error(`Can't run command '${psqlCommand}', maybe it needs escaping?`)
    }
    const result = await execa('sh', ['-c', command])
    console.log({query})
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
