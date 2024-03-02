import {ParseFn, pgTypes, setRecommendedTypeParsers} from '@pgkit/client'
import {TypeParserInfo} from '../types'

const jsValueMatchers: Array<[type: string, test: (value: unknown) => boolean]> = [
  ['number', val => typeof val === 'number'],
  ['string', val => typeof val === 'string'],
  ['boolean', val => typeof val === 'boolean'],
  ['bigint', val => typeof val === 'bigint'],
  ['Date', val => val instanceof Date],
]

/**
 * Mapping from pg_type.typname to a valid sample value
 */
// todo: explicitly test to see how these all come back by default from pg
// e.g. by doing sql`select ${sampleValue}::${sampleValueType}` somehow
// but wait - should these all be strings?
export const sampleTypeValues: Record<string, any> = {
  int8: 0,
  date: '2000-01-01',
  interval: '1 hour',
  numeric: 0,
  timestamp: '2000-01-01',
  timestamptz: '2000-01-01',
  varchar: '',
  text: '',
  smallint: 0,
  integer: 0,
  bigint: 0,
  decimal: 0,
  serial: 0,
  bigserial: 0,
  money: '$0.00',
}

export const inferTypeParserTypeScript = (tp: ParseFn, defaultSampleInput = ''): string => {
  const sample = tp(sampleTypeValues[tp.name] || defaultSampleInput)
  const match = jsValueMatchers.find(m => m[1](sample))
  return match?.[0] || `unknown`
}

export const defaultTypeParsers = (setTypeParsers = setRecommendedTypeParsers): TypeParserInfo[] => {
  const list = [] as TypeParserInfo[]
  setTypeParsers({
    builtins: pgTypes.builtins,
    setTypeParser(typeId, parse) {
      list.push({oid: typeId, typescript: inferTypeParserTypeScript(parse)})
    },
  })
  return list
}
