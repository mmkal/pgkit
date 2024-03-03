import pgPromise from 'pg-promise'
import {PGTypes, SetTypeParsers} from './types'

export const pgTypes: PGTypes = pgPromise().pg.types

export const setRecommendedTypeParsers: SetTypeParsers = types => {
  types.setTypeParser(types.builtins.DATE, value => new Date(value))
  types.setTypeParser(types.builtins.TIMESTAMPTZ, value => new Date(value))
  types.setTypeParser(types.builtins.TIMESTAMP, value => value)
  types.setTypeParser(types.builtins.INTERVAL, value => value)
  types.setTypeParser(types.builtins.NUMERIC, Number)
  types.setTypeParser(types.builtins.INT2, Number)
  types.setTypeParser(types.builtins.INT4, Number)
  types.setTypeParser(types.builtins.INT8, Number)
  types.setTypeParser(types.builtins.BOOL, value => value === 't')
}

/**
 * Equivalent of slonik type parsers in `createTypeParserPreset`. [Docs](https://www.npmjs.com/package/slonik#default-configuration)
 */
export const setSlonik37TypeParsers: SetTypeParsers = types => {
  types.setTypeParser(types.builtins.DATE, value => new Date(value))
  types.setTypeParser(types.builtins.TIMESTAMPTZ, value => new Date(value).getTime())
  types.setTypeParser(types.builtins.TIMESTAMP, value => new Date(value).getTime())
  types.setTypeParser(types.builtins.INTERVAL, value => value)
  types.setTypeParser(types.builtins.NUMERIC, Number)
}
