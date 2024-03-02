import {PostgreSQL} from '@pgkit/schemainspect'
import {SuggestParams, getSuggester} from '../src/packlets/autocomplete/suggest'
import everythingJson from './__snapshots__/seed.json'

const schema = PostgreSQL.fromJSON(everythingJson)
const suggester = getSuggester({schema, searchPath: 'public'})
const getArgs = (query: string, params?: SuggestParams) => {
  const flat = query.replaceAll('\n', ' ')
  const pipepipe = 'PIPEPIPE_____' + Math.random()
  const [before, after, ...extra] = flat
    .replaceAll('||', pipepipe)
    .split('|')
    .map(s => s.replaceAll(pipepipe, '||'))
  if (extra.length > 0) throw new Error(`too many |s in ${flat}`)
  if (params?.debug) console.dir({before, after, query, flat, new: before + after})
  return [before + after, {line: 1, column: before.length + 1}, params] as const
}

export const suggest = (query: string, params?: SuggestParams) => {
  return suggester.suggest(...getArgs(query, params)).suggestions
}

export const parse = (query: string, debug = false) => {
  const args = getArgs(query, {debug})
  return suggester.parse(args[0], args[1], debug)
}
