import {defaultExtractQueries} from './extract'
import {defaultWriteTypes} from './write'
import {defaultPGDataTypeToTypeScriptMappings} from './pg'
import {defaultTypeParsers} from './slonik'
import {Options} from './types'
import {createPool} from 'slonik'
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

export const getParams = (partial: Partial<Options>): Options => {
  let {
    connectionURI = defaultConnectionURI,
    psqlCommand = defaultPsqlCommand,
    pgTypeToTypeScript: gdescToTypeScript = () => undefined,
    rootDir = defaultRootDir,
    glob = [`**/*.{js,ts,cjs,mjs,sql}`, {ignore: ['**/node_modules/**']}],
    defaultType = defaultTypeScriptType,
    extractQueries = defaultExtractQueries,
    writeTypes = defaultWriteTypes(),
    pool = createPool(connectionURI),
    typeParsers = defaultTypeParsers(pool.configuration.typeParsers),
    logger = console,
    migrate = undefined,
    checkClean = defaultCheckClean,
  } = partial

  assert.ok(!connectionURI.match(/ '"/), `Connection URI should not contain spaces or quotes`)

  // if pool and connectionURI are passed, create a new pool with same config and the supplied connectionURI
  if (partial.pool && partial.connectionURI) {
    pool = createPool(connectionURI, pool.configuration)
  }

  return {
    connectionURI,
    psqlCommand,
    pgTypeToTypeScript: gdescToTypeScript,
    rootDir,
    glob,
    defaultType,
    extractQueries,
    writeTypes,
    pool,
    typeParsers,
    logger,
    migrate,
    checkClean,
  }
}
