import * as assert from 'assert'

import {defaultExtractQueries} from './extract'

import {defaultTypeParsers} from './type-parsers'
import {Options} from './types'
import {deepErrorCause} from './utils/errors'
import {defaultWriteTypes} from './write'

// Note: this provides 'default' helpers rather than the precise default values for `Options`
// e.g. the default `writeTypes` implementation depends on the specific value of `rootDir`.

export const typegenConfigFile = 'typegen.config.js'

export const defaultConnectionURI = 'postgresql://postgres:postgres@localhost:5432/postgres'

export const defaultPsqlCommand = 'psql'

export const defaultRootDir = 'src'

export const defaultTypeScriptType = 'unknown'

export const defaultCheckClean: Options['checkClean'] = ['before-migrate', 'after']

export const defaultIncludePatterns = ['**/*.{ts,sql}']

export const defaultExcludePatterns = ['**/node_modules/**']

const getWithWarning = <T>(logger: Options['logger'], message: string, value: T) => {
  logger.warn(message)
  return value
}

export const resolveOptions = (partial: Partial<Options>): Options => {
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
    include = defaultIncludePatterns,
    exclude = defaultExcludePatterns,
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
    formatError = deepErrorCause,
    ...rest
  } = partial

  null as unknown as keyof typeof rest satisfies 'glob'

  assert.ok(
    !('glob' in partial),
    `The 'glob' option is deprecated. Instead please use 'include', 'exclude' or 'since' respectively.`,
  )

  assert.strictEqual(Object.keys(rest).length, 0, `Unexpected configuration keys: ${Object.keys(rest).join(', ')}`)

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
    formatError,
  }
}

export {defaultPGDataTypeToTypeScriptMappings} from './pg'
export {defaultWriteFile, defaultWriteTypes} from './write'
export {defaultExtractQueries} from './extract'
export {defaultTypeParsers} from './type-parsers'
export {deepErrorCause as defaultFormatError} from './utils/errors'
