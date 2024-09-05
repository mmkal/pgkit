import * as assert from 'assert'

import {defaultExtractQueries} from './extract'

import {defaultTypeParsers} from './type-parsers'
import {Options} from './types'
import {defaultWriteTypes} from './write'

// Note: this provides 'default' helpers rather than the precise default values for `Options`
// e.g. the default `writeTypes` implementation depends on the specific value of `rootDir`.

export const typegenConfigFile = 'typegen.config.js'

export const defaultConnectionURI = 'postgresql://postgres:postgres@localhost:5432/postgres'

export const defaultPsqlCommand = 'psql'

export const defaultRootDir = 'src'

export const defaultTypeScriptType = 'unknown'

export const defaultCheckClean: Options['checkClean'] = ['before-migrate', 'after']

const getWithWarning = <T>(logger: Options['logger'], message: string, value: T) => {
  logger.warn(message)
  return value
}

export const getParams = (partial: Partial<Options>): Options => {
  const {
    logger = console,
    connectionString = getWithWarning(
      logger,
      `Using default connection URI of ${defaultConnectionURI}`,
      defaultConnectionURI,
    ),
    psqlCommand = defaultPsqlCommand,
    pgTypeToTypeScript: gdescToTypeScript = () => undefined,
    rootDir = defaultRootDir,
    include = ['**/*.{ts,sql}'],
    exclude = ['**/node_modules/**'],
    since = undefined,
    defaultType = defaultTypeScriptType,
    extractQueries = defaultExtractQueries,
    writeTypes = defaultWriteTypes(),
    poolConfig = getWithWarning<Options['poolConfig']>(
      logger,
      `Using default pool config - type parsers will not be respected.`,
      {},
    ),
    typeParsers = defaultTypeParsers(poolConfig.setTypeParsers),
    migrate = undefined,
    checkClean = defaultCheckClean,
    lazy = false,
    ...rest
  } = partial

  assert.ok(
    !('glob' in partial),
    `The 'glob' option is deprecated. Instead please use 'include', 'exclude' or 'since' respectively.`,
  )

  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  assert.strictEqual(Object.keys(rest).length, 0, `Unexpected configuration keys: ${Object.keys(rest)}`)

  assert.ok(!connectionString.includes(' \'"'), `Connection URI should not contain spaces or quotes`)

  return {
    connectionString,
    psqlCommand,
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
    checkClean,
    lazy,
  }
}

export {defaultPGDataTypeToTypeScriptMappings} from './pg'
export {defaultWriteFile, defaultWriteTypes} from './write'
export {defaultExtractQueries} from './extract'
export {defaultTypeParsers} from './type-parsers'
