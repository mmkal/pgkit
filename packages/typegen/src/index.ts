import * as lodash from 'lodash'
import {globAsync} from './util'
import {psqlClient} from './pg'
import * as defaults from './defaults'
import {Options, QueryField, DescribedQuery, ExtractedQuery, QueryParameter} from './types'
import {columnInfoGetter, isUntypeable} from './query'
import * as assert from 'assert'
import * as path from 'path'
import {parameterTypesGetter} from './query/parameters'
import {truncateQuery} from './util'
import {migrateLegacyCode} from './migrate'

export * from './types'
export * from './defaults'

import * as write from './write'

export {write}

export const generate = (params: Partial<Options> = {}) => {
  const {
    psqlCommand,
    connectionURI,
    gdescToTypeScript,
    rootDir,
    glob,
    defaultType,
    extractQueries,
    writeTypes,
    pool,
    typeParsers,
    logger,
    migrate,
  } = defaults.getParams(params)
  const {psql, getEnumTypes, getRegtypeToPGType} = psqlClient(`${psqlCommand} "${connectionURI}"`)

  const getFields = async (query: ExtractedQuery): Promise<QueryField[]> => {
    const rows = await psql(`${query.sql} \\gdesc`)
    const fields = await Promise.all(
      rows.map<Promise<QueryField>>(async row => ({
        name: row.Column,
        regtype: row.Type,
        typescript: await getTypeScriptType(row.Type, row.Column),
      })),
    )

    return Promise.all(fields)
  }

  const regTypeToTypeScript = async (regtype: string) => {
    const enumTypes = await getEnumTypes()
    return (
      defaults.defaultPGDataTypeToTypeScriptMappings[regtype] ||
      enumTypes[regtype]?.map(t => JSON.stringify(t.enumlabel)).join(' | ') ||
      defaultType
    )
  }

  const getParameterTypes = parameterTypesGetter(pool)
  const getParameters = async (query: ExtractedQuery): Promise<QueryParameter[]> => {
    const regtypes = await getParameterTypes(query.sql)

    const promises = regtypes.map(async (regtype, i) => ({
      name: `$${i + 1}`, // todo: parse query and use heuristic to get sensible names
      regtype,
      // todo(one day): handle arrays and other more complex types. Right now they'll fall back to `defaultType` (= `any` or `unknown`)
      typescript: await regTypeToTypeScript(regtype),
    }))

    return Promise.all(promises)
  }

  const getTypeScriptType = async (regtype: string, typeName: string): Promise<string> => {
    assert.ok(regtype, `No regtype found!`)

    const regtypeToPGType = await getRegtypeToPGType()

    if (regtype.endsWith('[]')) {
      return `Array<${await getTypeScriptType(regtype.slice(0, -2), typeName)}>`
    }

    if (regtype.match(/\(\d+\)/)) {
      // e.g. `character varying(10)`, which is the regtype from `create table t(s varchar(10))`
      return getTypeScriptType(regtype.split('(')[0], typeName)
    }

    const pgtype = regtypeToPGType[regtype].typname

    assert.ok(pgtype, `pgtype not found from regtype ${regtype}`)

    return (
      lodash.findLast(typeParsers, p => p.pgtype === pgtype)?.typescript ||
      gdescToTypeScript(regtype, typeName) ||
      (await regTypeToTypeScript(regtype))
    )
  }

  const findAll = async () => {
    const getColumnInfo = columnInfoGetter(pool)

    const globParams: Parameters<typeof globAsync> = typeof glob === 'string' ? [glob, {}] : glob

    logger.info(`Searching for files matching ${globParams[0]} in ${rootDir}.`)

    const getFiles = () =>
      globAsync(globParams[0], {
        ...globParams[1],
        cwd: path.resolve(process.cwd(), rootDir),
        absolute: true,
      })

    if (migrate) {
      migrateLegacyCode(migrate)({files: await getFiles(), logger})
    }

    const files = await getFiles() // Migration may have deleted some, get files from fresh.
    const extracted = files.flatMap(extractQueries)

    logger.info(`Found ${files.length} files and ${extracted.length} queries.`)

    const promises = extracted.map(
      async (query): Promise<DescribedQuery | null> => {
        try {
          if (isUntypeable(query.template)) {
            logger.debug(`Query \`${truncateQuery(query.sql)}\` in file ${query.file} is not typeable`)
            return null
          }
          return {
            ...query,
            fields: await getFields(query),
            parameters: query.file.endsWith('.sql') ? await getParameters(query) : [],
          }
        } catch (e) {
          logger.warn(`Describing query failed: ${e}`)
          return null
        }
      },
    )

    const describedQueries = lodash.compact(await Promise.all(promises))

    const uniqueFiles = [...new Set(describedQueries.map(q => q.file))]
    logger.info(
      `Succesfully processed ${describedQueries.length} out of ${promises.length} queries in files ${uniqueFiles} .`,
    )

    const analysedQueries = await Promise.all(describedQueries.map(getColumnInfo))

    await writeTypes(analysedQueries)
  }

  return findAll()
}
