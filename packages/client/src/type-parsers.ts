import {types as nodePgTypes} from 'pg'
import {PGTypes, ApplyTypeParsers} from './types'

export const pgTypes: PGTypes = nodePgTypes

export const applyRecommendedTypeParsers: ApplyTypeParsers = ({setTypeParser, builtins}) => {
  setTypeParser(builtins.DATE, value => new Date(String(value)))
  setTypeParser(builtins.TIMESTAMPTZ, value => new Date(String(value)))
  setTypeParser(builtins.TIMESTAMP, String)
  setTypeParser(builtins.INTERVAL, String)
  setTypeParser(builtins.NUMERIC, Number)
  setTypeParser(builtins.INT2, Number)
  setTypeParser(builtins.INT4, Number)
  setTypeParser(builtins.INT8, Number)
  setTypeParser(builtins.BOOL, value => String(value) === 't')
}

/**
 * Equivalent of slonik type parsers in `createTypeParserPreset`. [Docs](https://www.npmjs.com/package/slonik#default-configuration)
 */
export const applySlonik37TypeParsers: ApplyTypeParsers = ({setTypeParser, builtins}) => {
  setTypeParser(builtins.DATE, value => new Date(String(value)))
  setTypeParser(builtins.TIMESTAMPTZ, value => new Date(String(value)).getTime())
  setTypeParser(builtins.TIMESTAMP, value => new Date(String(value)).getTime())
  setTypeParser(builtins.INTERVAL, String)
  setTypeParser(builtins.NUMERIC, Number)
}
