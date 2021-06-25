import {defaultExtractQueries} from './extract'
import {defaultWriteTypes} from './write'
import {defaultPGDataTypeToTypeScriptMappings} from './pg'
import {defaultTypeParsers} from './slonik'
import {Options} from './types'
import * as assert from 'assert'

// Note: this provides 'default' helpers rather than the precise default values for `GdescriberParams`
// e.g. the default `writeTypes` implementation depends on the specific value of `rootDir`.

export const typegenConfigFile = 'typegen.config.js'

export {defaultWriteTypes, defaultTypeParsers, defaultExtractQueries, defaultPGDataTypeToTypeScriptMappings}

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
    connectionURI = getWithWarning(
      logger,
      `Using default connection URI of ${defaultConnectionURI}`,
      defaultConnectionURI,
    ),
    psqlCommand = defaultPsqlCommand,
    pgTypeToTypeScript: gdescToTypeScript = () => undefined,
    rootDir = defaultRootDir,
    // todo: remove js, maybe sql
    glob = [`**/*.{js,ts,cjs,mjs,sql}`, {ignore: ['**/node_modules/**']}],
    defaultType = defaultTypeScriptType,
    extractQueries = defaultExtractQueries,
    writeTypes = defaultWriteTypes(),
    poolConfig = getWithWarning<Options['poolConfig']>(
      logger,
      `Using default pool config - type parsers will not be respected.`,
      {},
    ),
    typeParsers = defaultTypeParsers(poolConfig.typeParsers || []),
    migrate = undefined,
    checkClean = defaultCheckClean,
    ...rest
  } = partial

  assert.strictEqual(Object.keys(rest).length, 0, `Unexpected configuration keys: ${Object.keys(rest)}`)

  assert.ok(!connectionURI.match(/ '"/), `Connection URI should not contain spaces or quotes`)

  return {
    connectionURI,
    psqlCommand,
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
    checkClean,
  }
}
