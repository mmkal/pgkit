import * as lodash from 'lodash'
import {globAsync, tryOrDefault, truncateQuery, checkClean, maybeDo, changedFiles, globList} from './util'
import {psqlClient} from './pg'
import * as defaults from './defaults'
import {Options, QueryField, DescribedQuery, ExtractedQuery, QueryParameter} from './types'
import {columnInfoGetter, isUntypeable, removeSimpleComments, simplifySql} from './query'
import * as assert from 'assert'
import * as path from 'path'
import * as fs from 'fs'
import {parameterTypesGetter} from './query/parameters'
import {migrateLegacyCode} from './migrate'
import * as write from './write'
import {createPool} from 'slonik'
import memoizee = require('memoizee')
import chokidar = require('chokidar')

export {Options} from './types'

export {defaults}

export {write}

export const generate = async (params: Partial<Options>) => {
  const {
    psqlCommand,
    connectionURI,
    pgTypeToTypeScript: gdescToTypeScript,
    rootDir,
    glob,
    defaultType,
    extractQueries,
    writeTypes,
    poolConfig,
    typeParsers,
    logger,
    migrate,
    checkClean: checkCleanWhen,
    lazy,
  } = defaults.getParams(params)

  const pool = createPool(connectionURI, {...poolConfig, preferNativeBindings: false})

  const {psql: _psql, getEnumTypes, getRegtypeToPGType} = psqlClient(`${psqlCommand} "${connectionURI}"`, pool)

  const _gdesc = async (sql: string) => {
    try {
      return await psql(`${sql} \\gdesc`)
    } catch (e) {
      const simplified = tryOrDefault(
        () => removeSimpleComments(sql),
        tryOrDefault(() => simplifySql(sql), ''),
      )

      return await psql(`${simplified} \\gdesc`)
    }
  }

  const psql = memoizee(_psql, {max: 1000})
  const gdesc = memoizee(_gdesc, {max: 1000})

  const getFields = async (query: ExtractedQuery): Promise<QueryField[]> => {
    const rows = await gdesc(query.sql)
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
      const itemType = await getTypeScriptType(regtype.slice(0, -2), typeName)
      return itemType.match(/^\w+$/) ? `${itemType}[]` : `Array<${itemType}>`
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

    const globParams: Parameters<typeof globAsync> =
      typeof glob === 'string'
        ? [glob, {}]
        : 'since' in glob
        ? [globList(changedFiles({since: glob.since, cwd: path.resolve(rootDir)})), {}]
        : glob

    const getFiles = () => {
      logger.info(`Searching for files matching ${globParams[0]} in ${rootDir}.`)
      return globAsync(globParams[0], {
        ...globParams[1],
        cwd: path.resolve(process.cwd(), rootDir),
        absolute: true,
      })
    }

    if (migrate) {
      await maybeDo(checkCleanWhen.includes('before-migrate'), checkClean)
      migrateLegacyCode(migrate)({files: await getFiles(), logger})
      await maybeDo(checkCleanWhen.includes('after-migrate'), checkClean)
    }

    async function generateForFiles(files: string[]) {
      const extracted = files.flatMap(extractQueries)

      logger.info(`Found ${files.length} files and ${extracted.length} queries.`)

      const promises = extracted.map(async (query): Promise<DescribedQuery | null> => {
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
          let message = `${query.file}:${query.line} Describing query failed: ${e}.`
          if (query.sql.includes('--')) {
            message += ' Try moving comments to dedicated lines.'
          }
          logger.warn(message)
          return null
        }
      })

      const describedQueries = lodash.compact(await Promise.all(promises))

      const uniqueFiles = [...new Set(describedQueries.map(q => q.file))]
      logger.info(
        `Succesfully processed ${describedQueries.length} out of ${promises.length} queries in files ${uniqueFiles} .`,
      )

      const analysedQueries = await Promise.all(describedQueries.map(getColumnInfo))

      await writeTypes(analysedQueries)
    }

    if (!lazy) {
      await generateForFiles(await getFiles())
    }

    const watch = () => {
      const cwd = path.resolve(rootDir)
      logger.info({message: 'Waiting for files to change', globParams, cwd})
      const watcher = chokidar.watch(globParams[0], {
        ignored: globParams[1]?.ignore,
        cwd,
        ignoreInitial: true,
      })
      const runOne = memoizee((filepath: string, _existingContent: string) => generateForFiles([filepath]), {
        max: 1000,
      })
      let promises: Promise<void>[] = []
      /**
       * memoized logger. We're memoizing several layers deep, so when the codegen runs on a file, it memoizes
       * the file path and content, and the queries inside the file. So when a file updates, it's processed and
       * re-edited inline, which triggers another file change handler. It's then _re-processed_ but since everything
       * is memoized the resultant content is unchanged from query cache hits. The file is written to with the same
       * content one more time before the `runOne` cache is hit. Memoizing the log for one second ensure we don't see
       * unnecessary `x.ts was changed, running codegen` entries. It's hacky, but there's not much overhead at runtime
       * or in code.
       */
      const log = memoizee((msg: unknown) => logger.info(msg), {max: 1000, maxAge: 5000})
      const handler = async (filepath: string) => {
        log(filepath + ' was changed, running codegen')
        const fullpath = path.join(cwd, filepath)
        const existingContent = fs.readFileSync(fullpath).toString()
        const promise = runOne(fullpath, existingContent)
        promises.push(promise)
        await promise
        log(filepath + ' updated.')
      }
      watcher.on('add', handler)
      watcher.on('change', handler)
      return {
        close: async () => {
          await watcher.close()
          await Promise.all(promises)
        },
      }
    }
    return watch
  }

  await maybeDo(checkCleanWhen.includes('before'), checkClean)
  const watch = await findAll()
  await maybeDo(checkCleanWhen.includes('after'), checkClean)

  return {watch}
}
