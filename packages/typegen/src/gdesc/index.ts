import * as lodash from 'lodash'
import {globAsync} from './util'
import {psqlClient} from './pg'
import * as defaults from './defaults'
import {GdescriberParams, QueryField, DescribedQuery} from './types'

export const gdescriber = ({
  psqlCommand = defaults.defaultPsqlCommand,
  gdescToTypeScript = () => undefined,
  rootDir = defaults.defaultRootDir,
  glob = [`**/*.{js,ts,cjs,mjs,sql}`, {cwd: rootDir, ignore: ['**/node_modules/**', '**/generated/**']}],
  defaultType = defaults.defaultTypeScriptType,
  extractQueries = defaults.defaultExtractQueries,
  writeTypes = defaults.defaultWriteTypes(`${rootDir}/generated/db`),
  typeParsers = defaults.defaultTypeParsers,
}: Partial<GdescriberParams> = {}) => {
  const {psql, getEnumTypes, getRegtypeToPGType} = psqlClient(psqlCommand)

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
    const files = await globAsync(globParams[0], {...globParams[1], absolute: true})
    const promises = files
      .flatMap(extractQueries)
      .map<Promise<DescribedQuery>>(async query => ({...query, fields: await describeCommand(query.sql)}))

    const queries = lodash.groupBy(await Promise.all(promises), q => q.tag)

    writeTypes(queries)
  }

  return findAll()
}
