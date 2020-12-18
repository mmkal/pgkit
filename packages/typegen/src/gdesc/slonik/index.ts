import {TypeScriptTypeParser} from '../types'
import * as slonik from 'slonik'

const matchers: Array<[type: string, test: (value: unknown) => boolean]> = [
  ['number', val => typeof val === 'number'],
  ['string', val => typeof val === 'string'],
  ['boolean', val => typeof val === 'boolean'],
  ['bigint', val => typeof val === 'bigint'],
  ['Date', val => val instanceof Date],
]

export const inferTypeParserTypeScript = (tp: slonik.TypeParserType<any>, sampleInput = '') => {
  const sample = tp.parse(sampleInput)
  const match = matchers.find(m => m[1](sample))
  return match?.[0] || `unknown /* ${tp.name} */`
}

export const defaultTypeParsers: TypeScriptTypeParser[] = slonik.createTypeParserPreset().map(tp => ({
  name: tp.name,
  parse: tp.parse,
  typescript: inferTypeParserTypeScript(tp),
}))
