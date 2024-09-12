import {createClient} from '@pgkit/client'
import * as assert from 'assert'
import chokidar = require('chokidar')
import * as fs from 'fs'
import {glob} from 'glob'
import * as lodash from 'lodash'
import memoizee = require('memoizee')
import * as neverthrow from 'neverthrow'
import * as path from 'path'
import * as defaults from './defaults'
import {migrateLegacyCode} from './migrate'
import {getEnumTypes, getRegtypeToPgTypnameMapping, psqlClient} from './pg'
import {getColumnInfo, getTypeability, removeSimpleComments} from './query'
import {getParameterTypes} from './query/parameters'
import {ExtractedQuery, Options, QueryField, QueryParameter} from './types'
import {changedFiles, checkClean, containsIgnoreComment, globList} from './util'

export type {Options} from './types'

export const generate = async (inputOptions: Partial<Options>) => {
  const options = defaults.resolveOptions(inputOptions)
  const logger = options.logger

  const pool = createClient(options.connectionString, options.poolConfig)

  const _gdesc = (inputSql: string, searchPath?: string) => {
    let connectionString = options.connectionString
    if (searchPath) {
      const url = new URL(connectionString)
      const optionsString = url.searchParams.get('options')
      const optionsParams = new URLSearchParams(optionsString || '')
      optionsParams.set('--search_path', searchPath)
      url.searchParams.set('options', optionsParams.toString())
      connectionString = url.toString()
    }
    assert.ok(!/"/.test(connectionString), `Connection strings with quotes must be escaped: ${connectionString}`)
    const {psql} = psqlClient(`${options.psqlCommand} "${connectionString}"`)
    return neverthrow
      .ok(inputSql)
      .map(sql => sql.trim().replace(/;$/, ''))
      .asyncAndThen(simplified => {
        const simplifiedCommand = `${simplified} \\gdesc`
        return neverthrow.fromPromise(
          psql(simplifiedCommand), //
          err => {
            let message = `psql failed.`
            if ((err as Error).message.includes('psql: command not found')) {
              message += ` If you're using docker, try using \`--psql 'docker-compose exec -T postgres psql'\`.`
            }
            if (searchPath) {
              message += `\n\nNote: search path was set to ${searchPath}. Connection string used: ${connectionString}`
            }
            return new Error(message, {cause: err})
          },
        )
      })
  }

  // const psql = memoizee(_psql, {max: 1000})
  const gdesc = memoizee(_gdesc, {max: 1000})

  const getLogPath = (filepath: string) => {
    const relPath = path.relative(process.cwd(), filepath)
    return relPath.startsWith('.') ? relPath : `./${relPath}`
  }

  const getFields = async (query: {sql: string}, searchPath?: string) => {
    const rowsResult = await gdesc(query.sql, searchPath)
    return rowsResult.asyncMap(async rows => {
      return Promise.all(
        rows.map<Promise<QueryField>>(async row => ({
          name: row.Column,
          regtype: row.Type,
          typescript: getTypeScriptType(row.Type),
        })),
      )
    })
  }

  const enumTypes = await getEnumTypes(pool)

  const getParameters = async (query: ExtractedQuery): Promise<QueryParameter[]> => {
    const regtypes = await getParameterTypes(pool, query.sql)

    const promises = regtypes.map(async (regtype, i) => ({
      name: `$${i + 1}`, // todo: parse query and use heuristic to get sensible names
      regtype,
      // todo(one day): handle arrays and other more complex types. Right now they'll fall back to `defaultType` (= `any` or `unknown`)
      typescript: getTypeScriptType(regtype),
    }))

    return Promise.all(promises)
  }

  const regtypeToPGTypeDictionary = await getRegtypeToPgTypnameMapping(pool)
  const getTypeScriptType = (regtype: string): string => {
    assert.ok(regtype, `No regtype found!`)

    if (regtype.endsWith('[]')) {
      const itemType = getTypeScriptType(regtype.slice(0, -2))
      return /^\w+$/.test(itemType) ? `${itemType}[]` : `Array<${itemType}>`
    }

    if (/\([\d ,]+\)/.test(regtype)) {
      // e.g. `character varying(10)`, which is the regtype from `create table t(s varchar(10))`
      return getTypeScriptType(regtype.split('(')[0])
    }

    const pgtype = regtypeToPGTypeDictionary[regtype]

    assert.ok(pgtype, `pgtype not found from regtype ${regtype}`)

    const lastWithOid = lodash.findLast(options.typeParsers, p => {
      return typeof pgtype === 'object' && 'oid' in pgtype && p.oid === pgtype.oid
    })
    return (
      lastWithOid?.typescript ||
      options.pgTypeToTypeScript(regtype) ||
      defaults.defaultPGDataTypeToTypeScriptMappings[regtype] ||
      enumTypes[regtype]?.map(t => JSON.stringify(t.enumlabel)).join(' | ') ||
      options.defaultType
    )
  }

  const findAll = async () => {
    const cwd = path.resolve(process.cwd(), options.rootDir)
    const logMsgInclude = `pattern${options.include.length > 1 ? 's' : ''} ${options.include.join(', ')}`
    const logMsgExclude = options.exclude.length > 0 ? ` excluding ${options.exclude.join(', ')}` : ''
    const logMsgSince = options.since ? ` since ${options.since}` : ''
    logger.info(`Matching files in ${getLogPath(cwd)} with ${logMsgInclude}${logMsgExclude}${logMsgSince}`)

    const getLogQueryReference = (query: {file: string; line: number}) => `${getLogPath(query.file)}:${query.line}`

    const getFiles = async () => {
      logger.info(`Searching for files.`)
      let files = glob.sync(globList(options.include), {
        cwd,
        ignore: options.exclude,
        absolute: true,
      })
      if (options.since) {
        // filter matched files to only include changed files and convert to absolute paths
        const changed = new Set(changedFiles({since: options.since, cwd}).map(file => path.join(cwd, file)))
        files = files.filter(file => changed.has(file))
      }

      logger.info(`Found ${files.length} files matching criteria.`)
      return files
    }

    if (options.migrate) {
      if (options.checkClean.includes('before-migrate')) checkClean()
      await migrateLegacyCode(options.migrate)({files: await getFiles(), logger})
      if (options.checkClean.includes('after-migrate')) checkClean()
    }

    async function generateForFiles(files: string[]) {
      const processedFiles = await Promise.all(files.map(generateForFile))

      const stats = {
        'Total files': processedFiles.length,
        'Files containing queries': processedFiles.filter(({total}) => total > 0).length,
        'Total queries': lodash.sumBy(processedFiles, f => f.total),
        'Successful queries': lodash.sumBy(processedFiles, f => f.successful),
        'Ignored queries': lodash.sumBy(processedFiles, f => f.ignored),
      }
      const padding = Object.keys(stats).sort((a, b) => b.length - a.length)[0].length

      logger.info(
        `Finished processing.\n` +
          Object.entries(stats)
            .map(([key, value]) => `${key}:${' '.repeat(padding - key.length + 1)}${value}`)
            .join('\n'),
      )
    }

    async function generateForFile(file: string) {
      const queries = options.extractQueries(file)

      const queriesToDescribe = queries.filter(({sql}) => !containsIgnoreComment(sql))
      const ignoreCount = queries.length - queriesToDescribe.length

      const analysedQueryResults = await Promise.all(
        queriesToDescribe.map(async query => {
          const describedQuery = await describeQuery(query)
          return describedQuery.asyncMap(dq => getColumnInfo(pool, dq, getTypeScriptType))
        }),
      )

      const successfuls = analysedQueryResults.flatMap(res => {
        if (res.isOk()) return [res.value]
        const formattedError = options.formatError(res.error)
        if (formattedError) logger.warn(formattedError)
        return []
      })

      if (queries.length > 0) {
        const ignoreMsg = ignoreCount > 0 ? ` (${ignoreCount} ignored)` : ''
        logger.info(
          `${getLogPath(file)} finished. Processed ${successfuls.length}/${queries.length} queries${ignoreMsg}.`,
        )
      }

      if (successfuls.length > 0) {
        await options.writeTypes(analysedQueryResults.flatMap(res => (res.isOk() ? [res.value] : [])))
      }
      return {
        total: queries.length,
        successful: successfuls.length,
        ignored: ignoreCount,
      }
    }

    // uses _gdesc or fallback to attain basic type information
    const describeQuery = async (query: ExtractedQuery) => {
      const typeability = getTypeability(query.template)
      if (typeability.isErr()) {
        return typeability.mapErr(
          err => new Error(`${getLogQueryReference(query)} [!] Query is not typeable.`, {cause: err}),
        ) satisfies neverthrow.Result<unknown, Error> as never
      }

      const fieldsResult = await getFields(query)
      const res = await fieldsResult
        .mapErr(err => {
          let message = `${getLogQueryReference(query)} [!] Extracting types from query failed.`
          if (query.sql.includes('--')) {
            message += ' Try moving comments to dedicated lines.'
          }

          if (query.sql.includes(';')) {
            message += ` Try removing trailing semicolons, separating multi-statement queries into separate queries, using a template variable for semicolons inside strings, or ignoring this query.`
          }

          return new Error(message, {cause: err})
        })
        .asyncMap(async fields => ({
          ...query,
          fields,
          parameters: query.file.endsWith('.sql') ? await getParameters(query) : [],
        }))

      return res
    }

    if (!options.lazy) {
      logger.info('Starting initial codegen')
      await generateForFiles(await getFiles())
      logger.info('Initial codegen complete')
    }

    const watch = () => {
      logger.info(`Watching for file changes.`)
      const watcher = chokidar.watch(options.include, {
        cwd,
        ignored: [...options.exclude],
        ignoreInitial: true,
      })
      const content = new Map<string, string>()
      const promises: Array<Promise<void>> = []
      const getContentSync = (filepath: string) => fs.readFileSync(filepath).toString()
      const handler = async (filepath: string, ..._args: unknown[]) => {
        const fullpath = path.join(cwd, filepath)
        if (content.get(fullpath) === getContentSync(fullpath)) {
          return // didn't change from what we'd expect
        }

        logger.info(getLogPath(fullpath) + ' was changed, running codegen.')
        const promise = generateForFile(fullpath).then<void>(() => {
          content.set(fullpath, getContentSync(fullpath))
          logger.info(getLogPath(fullpath) + ' codegen complete.')
          return void 0
        })
        promises.push(promise)
        await promise
      }

      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      watcher.on('add', async f => handler(f, 'add'))
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      watcher.on('change', async f => handler(f, 'change'))
      const closer = {
        async close() {
          await watcher.close()
          await Promise.all(promises)
        },
      }

      return Object.assign(new Promise(() => {}), closer)
    }

    return watch
  }

  if (options.checkClean.includes('before')) checkClean()
  const watch = await findAll()
  if (options.checkClean.includes('after')) checkClean()

  return {watch}
}

export * as write from './write'
export * as defaults from './defaults'
