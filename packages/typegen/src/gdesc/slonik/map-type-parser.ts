import {TypeParserInfo} from '../types'
import * as slonik from 'slonik'

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
// todo: explicitly test to see how these all come back by default from pg/slonik
// e.g. by doing sql`select ${sampleValue}::${sampleValueType}` somehow
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

export const inferTypeParserTypeScript = (tp: slonik.TypeParserType<any>, defaultSampleInput = '') => {
  const sample = tp.parse(sampleTypeValues[tp.name] || defaultSampleInput)
  const match = jsValueMatchers.find(m => m[1](sample))
  return match?.[0] || `unknown /* ${tp.name} */`
}

export const defaultTypeParsers = (parsers: readonly slonik.TypeParserType<unknown>[]): TypeParserInfo[] =>
  parsers.map(tp => ({
    pgtype: tp.name, // slonik uses `name` for the type, corresponding to `pg_type.typname`
    typescript: inferTypeParserTypeScript(tp),
  }))
