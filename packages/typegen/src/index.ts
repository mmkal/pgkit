import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'

import * as lodash from 'lodash'
import {createPool} from 'slonik'

import * as defaults from './defaults'
import {migrateLegacyCode} from './migrate'
import {psqlClient} from './pg'
import {AnalyseQueryError, columnInfoGetter, isUntypeable, removeSimpleComments, simplifySql} from './query'
import {parameterTypesGetter} from './query/parameters'
import {AnalysedQuery, DescribedQuery, ExtractedQuery, Options, QueryField, QueryParameter} from './types'
import {
  changedFiles,
  checkClean,
  containsIgnoreComment,
  globAsync,
  globList,
  maybeDo,
  truncateQuery,
  tryOrDefault,
} from './util'
import * as write from './write'

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
    include,
    exclude,
    since,
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

  const pool = createPool(connectionURI, poolConfig)

  const {psql: _psql, getEnumTypes, getRegtypeToPGType} = psqlClient(`${psqlCommand} "${connectionURI}"`, pool)

  const _gdesc = async (sql: string) => {
    sql = sql.trim().replace(/;$/, '')
    assert.ok(!sql.includes(';'), `Can't use \\gdesc on query containing a semicolon`)
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

  const getLogPath = (filepath: string) => {
    const relPath = path.relative(process.cwd(), filepath)
    return relPath.charAt(0) === '.' ? relPath : `./${relPath}`
  }

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
    const cwd = path.resolve(process.cwd(), rootDir)
    const logMsgInclude = `pattern${include.length > 1 ? 's' : ''} ${include.join(', ')}`
    const logMsgExclude = exclude.length > 0 ? ` excluding ${exclude.join(', ')}` : ''
    const logMsgSince = since ? ` since ${since}` : ''
    logger.info(`Matching files in ${getLogPath(cwd)} with ${logMsgInclude}${logMsgExclude}${logMsgSince}`)

    const getColumnInfo = columnInfoGetter(pool)

    const getLogQueryReference = (query: {file: string; line: number}) => `${getLogPath(query.file)}:${query.line}`

    const getFiles = async () => {
      logger.info(`Searching for files.`)
      let files = await globAsync(globList(include), {
        cwd,
        ignore: exclude,
        absolute: true,
      })
      if (since) {
        // filter matched files to only include changed files and convert to absolute paths
        const changed = changedFiles({since, cwd}).map(file => path.join(cwd, file))
        files = files.filter(file => changed.includes(file))
      }
      logger.info(`Found ${files.length} files matching criteria.`)
      return files
    }

    if (migrate) {
      await maybeDo(checkCleanWhen.includes('before-migrate'), checkClean)
      migrateLegacyCode(migrate)({files: await getFiles(), logger})
      await maybeDo(checkCleanWhen.includes('after-migrate'), checkClean)
    }

    async function generateForFiles(files: string[]) {
      const processedFiles = await Promise.all(files.map(generateForFile))

      // gather stats for log
      const queriesTotal = processedFiles.reduce((sum, {total}) => sum + total, 0)
      const queriesSuccessful = processedFiles.reduce((sum, {successful}) => sum + successful, 0)
      const filesSuccessful = processedFiles.reduce((sum, {successful}) => sum + (successful > 0 ? 1 : 0), 0)
      const queriesMsg = queriesSuccessful < queriesTotal ? `${queriesSuccessful}/${queriesTotal}` : queriesTotal
      const filesMsg = filesSuccessful < files.length ? `${filesSuccessful}/${files.length}` : files.length
      logger.info(`Finished processing ${queriesMsg} queries in ${filesMsg} files.`)
    }

    async function generateForFile(file: string) {
      const queries = extractQueries(file)

      const queriesToDescribe = queries.filter(({sql}) => !containsIgnoreComment(sql))
      const ignoreCount = queries.length - queriesToDescribe.length

      const queriesToAnalyse = queriesToDescribe.map(async (query): Promise<AnalysedQuery | null> => {
        const describedQuery = await describeQuery(query)
        if (describedQuery === null) {
          return null
        }
        return await analyseQuery(describedQuery)
      })

      const analysedQueries = lodash.compact(await Promise.all(queriesToAnalyse))

      if (queries.length > 0) {
        const ignoreMsg = ignoreCount > 0 ? ` (${ignoreCount} ignored)` : ''
        logger.info(
          `${getLogPath(file)} finished. Processed ${analysedQueries.length}/${queries.length} queries${ignoreMsg}.`,
        )
      }
      if (analysedQueries.length > 0) {
        await writeTypes(analysedQueries)
      }

      return {
        total: queries.length,
        successful: analysedQueries.length,
        ignored: ignoreCount,
      }
    }

    // uses _gdesc or fallback to attain basic type information
    const describeQuery = async (query: ExtractedQuery): Promise<DescribedQuery | null> => {
      try {
        if (isUntypeable(query.template)) {
          logger.debug(`${getLogQueryReference(query)} [!] Query is not typeable.`)
          return null
        }
        return {
          ...query,
          fields: await getFields(query),
          parameters: query.file.endsWith('.sql') ? await getParameters(query) : [],
        }
      } catch (e) {
        let message = `${getLogQueryReference(query)} [!] Extracting types from query failed: ${e}.`
        if (query.sql.includes('--')) {
          message += ' Try moving comments to dedicated lines.'
        }
        if (query.sql.includes(';')) {
          message += ` Try removing trailing semicolons, separating multi-statement queries into separate queries, using a template variable for semicolons inside strings, or ignoring this query.`
        }
        logger.warn(message)
        return null
      }
    }

    // use pgsql-ast-parser or fallback to add column information (i.e. nullability)
    const analyseQuery = (query: DescribedQuery): Promise<AnalysedQuery> => {
      return getColumnInfo(query).catch(e => {
        if (e instanceof AnalyseQueryError && undefined !== e.recover) {
          // well this is not great, but we can recover from this with default values, which are better than nothing.
          logger.debug(
            `${getLogQueryReference(
              query,
            )} [!] Error parsing column details: column, comment and nullability might be incorrect.`,
          )
          return e.recover
        }
        /* istanbul ignore next */
        throw e
      })
    }

    if (!lazy) {
      await generateForFiles(await getFiles())
    }

    const watch = () => {
      logger.info(`Watching for file changes.`)
      const watcher = chokidar.watch(include, {
        cwd,
        ignored: [...exclude],
        ignoreInitial: true,
      })
      const content = new Map<string, string>()
      const promises: Promise<void>[] = []
      const getContentSync = (filepath: string) => fs.readFileSync(filepath).toString()
      const handler = async (filepath: string) => {
        const fullpath = path.join(cwd, filepath)
        if (content.get(fullpath) === getContentSync(fullpath)) {
          return // didn't change from what we'd expect
        }
        logger.info(getLogPath(fullpath) + ' was changed, running codegen.')
        const promise = generateForFile(fullpath).then(() => {
          content.set(fullpath, getContentSync(fullpath))
        })
        promises.push(promise)
        await promise
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
