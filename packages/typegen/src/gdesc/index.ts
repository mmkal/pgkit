import * as lodash from 'lodash'
import {globAsync} from './util'
import {psqlClient} from './pg'
import * as defaults from './defaults'
import {GdescriberParams, QueryField, DescribedQuery} from './types'
import {getColumnInfo} from './query-analysis'

export * from './types'
export * from './defaults'

export const gdescriber = (params: Partial<GdescriberParams> = {}) => {
  const {
    psqlCommand,
    gdescToTypeScript,
    rootDir,
    glob,
    defaultType,
    extractQueries,
    writeTypes,
    pool,
    typeParsers,
  } = defaults.getParams(params)
  const {psql, getEnumTypes, getRegtypeToPGType} = psqlClient(psqlCommand)

  const describeCommand = async (query: string): Promise<QueryField[]> => {
    const rows = await psql(`${query} \\gdesc`)
    const fields = await Promise.all(
      rows.map<Promise<QueryField>>(async row => ({
        name: row.Column,
        gdesc: row.Type,
        typescript: await getTypeScriptType(row.Type, row.Column),
      })),
    )

    return Promise.all(fields)
  }

  const getTypeScriptType = async (regtype: string, typeName: string): Promise<string> => {
    if (!regtype) {
      return defaultType
    }

    const enumTypes = await getEnumTypes()
    const regtypeToPGType = await getRegtypeToPGType()

    if (regtype?.endsWith('[]')) {
      return `Array<${await getTypeScriptType(regtype.slice(0, -2), typeName)}>`
    }

    if (regtype?.match(/\(\d+\)/)) {
      return getTypeScriptType(regtype.split('(')[0], typeName)
    }

    const pgtype = regtypeToPGType[regtype]?.typname

    return (
      lodash.findLast(typeParsers, p => p.pgtype === pgtype)?.typescript ||
      gdescToTypeScript(regtype, typeName) ||
      defaults.defaultPGDataTypeToTypeScriptMappings[regtype] ||
      enumTypes[regtype]?.map(t => JSON.stringify(t.enumlabel)).join(' | ') ||
      defaultType
    )
  }

  const findAll = async () => {
    const n = getColumnInfo(pool)

    const globParams: Parameters<typeof globAsync> = typeof glob === 'string' ? [glob, {}] : glob
    const files = await globAsync(globParams[0], {...globParams[1], cwd: rootDir, absolute: true})
    const promises = files.flatMap(extractQueries).map(async query => {
      const querySql = query.sql || query.template.map((s, i) => (i === 0 ? s : `$${i}${s}`)).join('')
      const described: DescribedQuery = {
        ...query,
        fields: await describeCommand(querySql).catch(() => []),
      }

      return n(described)
    })

    const queries = await Promise.all(promises)

    writeTypes(queries)
  }

  return findAll()
}
