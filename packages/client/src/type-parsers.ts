import pgPromise from 'pg-promise'
import {PGTypes, ApplyTypeParsers} from './types'

export const pgTypes: PGTypes = pgPromise().pg.types

export const applyRecommendedTypeParsers: ApplyTypeParsers = ({setTypeParser, builtins}) => {
  setTypeParser(builtins.DATE, value => new Date(value))
  setTypeParser(builtins.TIMESTAMPTZ, value => new Date(value))
  setTypeParser(builtins.TIMESTAMP, value => value)
  setTypeParser(builtins.INTERVAL, value => value)
  setTypeParser(builtins.NUMERIC, Number)
  setTypeParser(builtins.INT2, Number)
  setTypeParser(builtins.INT4, Number)
  setTypeParser(builtins.INT8, Number)
  setTypeParser(builtins.BOOL, value => value === 't')
}

/**
 * Equivalent of slonik type parsers in `createTypeParserPreset`. [Docs](https://www.npmjs.com/package/slonik#default-configuration)
 */
export const applySlonik37TypeParsers: ApplyTypeParsers = ({setTypeParser, builtins}) => {
  setTypeParser(builtins.DATE, value => new Date(value))
  setTypeParser(builtins.TIMESTAMPTZ, value => new Date(value).getTime())
  setTypeParser(builtins.TIMESTAMP, value => new Date(value).getTime())
  setTypeParser(builtins.INTERVAL, value => value)
  setTypeParser(builtins.NUMERIC, Number)
}
