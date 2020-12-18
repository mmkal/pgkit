import {defaultExtractQueries} from './extract'
import {defaultWriteTypes} from './write'
import {defaultPGDataTypeToTypeScriptMappings} from './pg'
import {defaultTypeParsers} from './slonik'

// Note: this provides 'default' helpers rather than the precise default values for `GdescriberParams`
// e.g. the default `writeTypes` implementation depends on the specific value of `rootDir`.

export {defaultWriteTypes, defaultTypeParsers, defaultExtractQueries, defaultPGDataTypeToTypeScriptMappings}

export const defaultPsqlCommand = `docker-compose exec -T postgres psql -h localhost -U postgres postgres`

export const defaultRootDir = 'src'

export const defaultTypeScriptType = 'unknown'
