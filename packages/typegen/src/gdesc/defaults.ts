import {defaultExtractQueries} from './extract'
import {defaultWriteTypes} from './write'
import {defaultPGDataTypeToTypeScriptMappings} from './pg'
import {defaultTypeParsers} from './slonik'
import {GdescriberParams} from './types'
import {createPool} from 'slonik'

// Note: this provides 'default' helpers rather than the precise default values for `GdescriberParams`
// e.g. the default `writeTypes` implementation depends on the specific value of `rootDir`.

export const typegenConfigFile = 'typegen.config.js'

export {defaultWriteTypes, defaultTypeParsers, defaultExtractQueries, defaultPGDataTypeToTypeScriptMappings}

export const defaultSlonikConnectionString = 'postgresql://postgres:postgres@localhost:5433/postgres'

export const defaultPsqlCommand = `docker-compose exec -T postgres psql -h localhost -U postgres postgres`

export const defaultRootDir = 'src'

export const defaultTypeScriptType = 'unknown'

export const getParams = ({
  psqlCommand = defaultPsqlCommand,
  gdescToTypeScript = () => undefined,
  rootDir = defaultRootDir,
  glob = [`**/*.{js,ts,cjs,mjs,sql}`, {ignore: ['**/node_modules/**']}],
  defaultType = defaultTypeScriptType,
  extractQueries = defaultExtractQueries,
  writeTypes = defaultWriteTypes(),
  pool = createPool(defaultSlonikConnectionString),
  typeParsers = defaultTypeParsers(pool.configuration.typeParsers),
  logger = console,
  migrate = undefined,
}: Partial<GdescriberParams>): GdescriberParams => ({
  psqlCommand,
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
})
