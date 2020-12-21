import * as lodash from 'lodash'
import {globAsync} from './util'
import {psqlClient} from './pg'
import * as defaults from './defaults'
import {GdescriberParams, QueryField, DescribedQuery} from './types'

export * from './types'
export * from './defaults'

// todo: logging
// todo: search for non-type-tagged queries and use a heuristic to guess a good name from them
// using either sql-surveyor or https://github.com/oguimbal/pgsql-ast-parser

export const gdescriber = (params: Partial<GdescriberParams> = {}) => {
  const {
    psqlCommand,
    gdescToTypeScript,
    rootDir,
    glob,
    defaultType,
    extractQueries,
    writeTypes,
    typeParsers,
  } = defaults.getParams({
    ...params,
  })
  const {psql, getEnumTypes, getRegtypeToPGType} = psqlClient(psqlCommand)

  const describeCommand = async (query: string): Promise<QueryField[]> => {
    const rows = await psql(`${query} \\gdesc`)
    return Promise.all(
      rows.map<Promise<QueryField>>(async row => ({
        name: row[0],
        gdesc: row[1],
        typescript: await getTypeScriptType(row[1], row[0]),
        // column: {},
      })),
    )
  }

  const getTypeScriptType = async (regtype: string, typeName: string): Promise<string> => {
    if (!regtype) {
      return defaultType
    }

    const enumTypes = await getEnumTypes()
    const regtypeToPGType = await getRegtypeToPGType()

    if (regtype?.endsWith('[]')) {
      return `Array<${getTypeScriptType(regtype.slice(0, -2), typeName)}>`
    }

    if (regtype?.match(/\(\d+\)/)) {
      return getTypeScriptType(regtype.split('(')[0], typeName)
    }

    const pgtype = regtypeToPGType[regtype]?.typname

    return (
      lodash.findLast(typeParsers, p => p.name === pgtype)?.typescript ||
      gdescToTypeScript(regtype, typeName) ||
      defaults.defaultPGDataTypeToTypeScriptMappings[regtype] ||
      enumTypes[regtype]?.map(t => JSON.stringify(t.enumlabel)).join(' | ') ||
      defaultType
    )
  }

  const findAll = async () => {
    const globParams: Parameters<typeof globAsync> = typeof glob === 'string' ? [glob, {}] : glob
    const files = await globAsync(globParams[0], {...globParams[1], cwd: rootDir, absolute: true})
    const promises = files.flatMap(extractQueries).map<Promise<DescribedQuery>>(async query => ({
      ...query,
      fields: await describeCommand(query.sql),
    }))

    const queries = lodash.groupBy(await Promise.all(promises), q => q.tag)

    writeTypes(queries)
  }

  return findAll()
}
