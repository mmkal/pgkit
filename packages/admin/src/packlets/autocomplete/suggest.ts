import {ColumnInfo, Inspected, PostgreSQL} from '@pgkit/schemainspect'
import {SQLAutocomplete, SQLDialect, AutocompleteOptionType} from 'sql-autocomplete'
// import * as wsqlLib from './websql-autocomplete-lib'
import * as wsqla from 'websql-autocomplete'

export type DeepMap<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown> ? DeepMap<T[K]> : T[K]
}

export type PostgreSQLJson = DeepMap<PostgreSQL>

export type Position = {
  /** 1-indexed */
  line: number
  column: number
}

export type SuggestionType = 'table' | 'view' | 'column' | 'function' | 'aggregate' | 'keyword'

export type Suggestion = {
  text: string
  /** if specified, this is a version of `text` that hasn't had changes made to it. e.g. if there's a column name that exists on two tables, the table names/aliases will be added as prefixes */
  // todo: check this is necessary?
  unmodified?: string
  type: SuggestionType
  source: Inspected | ColumnInfo | 'keyword' | 'aggregate'
  detail: string | null
}

const sorter =
  <T>(fn: (item: T) => string | number | boolean) =>
  (left: T, right: T) => {
    const a = fn(left)
    const b = fn(right)
    return a > b ? 1 : a < b ? -1 : 0
  }

const cursorify = (query: string, position: Position) => {
  const queryUpToPosition = query
    .split('\n')
    .slice(0, position.line)
    .map((line, i, {length}) => (i === length - 1 ? line.slice(0, position.column - 1) : line))
    .join('\n')
  const cursorified = queryUpToPosition + '|' + query.slice(queryUpToPosition.length)

  return {queryUpToPosition, cursorified}
}

export interface SuggesterParmas {
  schema: PostgreSQLJson
  searchPath: string
}

export interface SuggestParams {
  explicit?: boolean
  debug?: boolean
}

export const getSuggester = ({schema, searchPath}: SuggesterParmas) => {
  const sqla = new SQLAutocomplete(
    SQLDialect.PLpgSQL,
    Object.keys(schema.selectables),
    Object.values(schema.selectables).flatMap(t => Object.keys(t.columns)),
  )

  const searchPathSchemas = new Set(searchPath.split(',').map(s => s.trim()))

  const selectablesByName = groupBy(Object.values(schema.selectables), s => s.name)

  const parse = (query: string, position: Position, debug = false) => {
    const flatQuery = query.replaceAll('\n', ' ')
    const {queryUpToPosition, cursorified} = cursorify(query, position)
    query = queryUpToPosition + query.slice(queryUpToPosition.length).split(';').at(0) || ''
    let wsqlResponse = wsqla.parsePostgreSqlQuery(query, position)
    const sqlaResponse = sqla.autocomplete(queryUpToPosition)

    const currentWord = queryUpToPosition.split(/\b/).at(-1) || ''
    let prefix = ''

    const noDice = wsqlNoDice(wsqlResponse)
    if (debug)
      console.dir(
        {noDice, query, flatQuery, cursorified, position, currentWord, queryUpToPosition, wsqlResponse, sqlaResponse},
        {depth: 10},
      )

    if (noDice && sqlaResponse.some(a => a.optionType === AutocompleteOptionType.COLUMN)) {
      const problematicDotContainer = /(\w+\.\w*)$/.exec(queryUpToPosition)
      if (problematicDotContainer) {
        const [pdcString] = problematicDotContainer
        prefix = pdcString.split('.')[0] + '.'
        const modifiedQuery = queryUpToPosition.slice(0, -pdcString.length) + query.slice(queryUpToPosition.length)
        const modifiedPosition = {
          ...position,
          column: position.column - pdcString.length,
        }
        wsqlResponse = wsqla.parsePostgreSqlQuery(modifiedQuery, modifiedPosition)
      }
    }

    return {
      query,
      flatQuery,
      queryUpToPosition,
      position,
      prefix,
      currentWord,
      wsql: wsqlResponse,
      sqla: sqlaResponse,
      cursorified,
    }
  }

  // eslint-disable-next-line mmkal/unicorn/template-indent
  const aggregateFunctions = `
  array_agg
  array_agg
  dimension 
  avg
  average 
  bit_and
  bit_or
  bool_and
  bool_or
  count
  count
  every
  json_agg
  jsonb_agg
  json_object_agg
  jsonb_object_agg
  max
  min
  string_agg
  sum
  xmlagg
  `
    .split('\n')
    .map(f => f.trim())
    .filter(Boolean)
  const suggest = (
    query: string,
    position: Position,
    {explicit, debug}: SuggestParams = {},
  ): {suggestions: Suggestion[]} => {
    const {wsql, sqla, ...parsed} = parse(query, position, debug)

    if (debug) console.dir({query, position, wsql, sqla}, {depth: 10})
    const suggestions: Suggestion[] = []
    if (
      wsql.suggestViewsOrTables === wsqla.TableOrViewSuggestion.ALL ||
      wsql.suggestViewsOrTables === wsqla.TableOrViewSuggestion.TABLES
    ) {
      suggestions.push(
        ...Object.values(schema.tables).map(t => {
          const isOnSearchPath = searchPathSchemas.has(t.schema)
          const qualifier = isOnSearchPath ? '' : t.schema + '.'
          return {
            text: qualifier + t.name,
            source: t,
            type: 'table',
            detail: null,
          } satisfies Suggestion
        }),
      )
    }

    if (
      wsql.suggestViewsOrTables === wsqla.TableOrViewSuggestion.ALL ||
      wsql.suggestViewsOrTables === wsqla.TableOrViewSuggestion.VIEWS
    ) {
      suggestions.push(
        ...Object.values(schema.views).map(t => {
          const isOnSearchPath = searchPathSchemas.has(t.schema)
          const qualifier = isOnSearchPath ? '' : t.schema + '.'
          return {
            text: qualifier + t.name,
            source: t,
            type: 'view',
            detail: null,
          } satisfies Suggestion
        }),
      )
    }

    const columnSuggestions = wsql.suggestColumns?.tables?.flatMap(table => {
      const [tableName, schemaName] = table.name
        .split('.')
        .map(name => name.replace(/^"(\w+)"$/, '$1'))
        .reverse()
      const [key = '', tableInfo] =
        Object.entries(schema.selectables).find(
          ([_key, t]) => t.name === tableName && t.schema === (schemaName || t.schema),
        ) || []
      const aColumnNames = new Set(
        sqla
          .filter(a => a.optionType === AutocompleteOptionType.COLUMN)
          .map(a => a.value)
          .filter(Boolean),
      )
      // if (debug) console.dir({aColumnNames, columns: tableInfo?.columns}, {depth: 10})
      return Object.values(tableInfo?.columns || {})
        .filter(c => aColumnNames.size === 0 || aColumnNames.has(c.name))
        .map(c => {
          const props = ['tables', 'views', 'materialized_views', 'selectables'] as const
          const match = props.find(p => key in schema[p])
          const selectableType = match?.replace(/s$/, '')
          return {
            suggestion: {
              text: c.name,
              source: c,
              type: 'column',
              detail: `${c.dbtypestr} ${c.not_null ? 'not null' : 'nullable'} (${selectableType}: ${tableName})`,
            } satisfies Suggestion,
            wsqlTable: table,
            tableInfo,
          }
        })
    })
    const columnGroups = groupBy(columnSuggestions || [], s => s.suggestion.text || '')
    Object.values(columnGroups).forEach(group => {
      if (group.length === 1) {
        suggestions.push(group[0].suggestion)
      } else {
        suggestions.push(
          ...group.map(
            ({suggestion, wsqlTable}): Suggestion => ({
              ...suggestion,
              unmodified: suggestion.text,
              text: `${wsqlTable.alias || wsqlTable.name}.${suggestion.text}`,
            }),
          ),
        )
      }
    })

    if (debug) console.log('suggestions', suggestions)

    if (parsed.prefix) {
      // if there's a prefix, assume it's something like `t.` in `select t.| from mytable t`. So only suggest columns in that case
      // might need to do better than assuming prefix always means that someday, though.
      return {suggestions}
    }

    if (wsql.suggestFunctions) {
      suggestions.push(
        ...Object.values(schema.functions).map((f): Suggestion => {
          return {
            text: f.name,
            source: f,
            type: 'function',
            detail:
              'function ' +
              Object.values(f.inputs)
                .map(i => i.name)
                .toString() +
              ' -> ' +
              Object.values(f.columns)
                .map(c => c.name)
                .toString(),
          }
        }),
      )
    }

    if (wsql.suggestAggregateFunctions) {
      suggestions.push(
        ...aggregateFunctions.map((f): Suggestion => {
          return {text: f, source: 'aggregate', type: 'aggregate', detail: null}
        }),
      )
    }

    if (wsql.suggestKeywords?.length) {
      const worthAddingKeyword = (kw: string) =>
        suggestions.length > 0 || // if we're already show suggestions, no harm in adding a few more at the bottom
        explicit || // the user specifically asked for suggesitons
        (parsed.currentWord.trim() && getCloseness(kw, parsed.currentWord.toLowerCase()) <= 10) // the keyword is close to the current word
      const seen = new Set<string>()
      const numSuggestionsBeforeKeywords = suggestions.length
      sqla.forEach(a => {
        if (a.optionType !== AutocompleteOptionType.KEYWORD) return
        const text = a.value.toLowerCase()
        if (!worthAddingKeyword(text)) return
        seen.add(text)
        suggestions.push({text, source: 'keyword', type: 'keyword', detail: null})
      })
      if (suggestions.length === numSuggestionsBeforeKeywords) {
        // usually, sql-autocomplete keywords are more relevant, but sometimes there are none (e.g. `insert into foo (a) values (1) retur|` where `returning` is a keyword but not in sql-autocomplete's list)
        suggestions.push(
          ...wsql.suggestKeywords
            .filter(k => !seen.has(k.value.toLowerCase()) && worthAddingKeyword(k.value.toLowerCase()))
            .map(
              k =>
                ({
                  text: k.value.toLowerCase(),
                  source: 'keyword',
                  type: 'keyword',
                  detail: null,
                }) satisfies Suggestion,
            ),
        )
      }
    }

    suggestions.sort(
      sorter(s => {
        const text = (s.unmodified || s.text)?.toLowerCase()
        if (!text) return 200

        const currentWordLower = parsed.queryUpToPosition.split(/\b/).at(-1)?.toLowerCase() || ''
        if (text === currentWordLower) return -1

        const currentPhraseLower = parsed.queryUpToPosition.split(/\s/).at(-1)?.toLowerCase()

        if (text === currentPhraseLower) return -0.5

        const closeness = getCloseness(text, currentWordLower)

        /* eslint-disable @stylistic/no-mixed-operators */
        if (s.type === 'column') return 0 + closeness / 100
        if (s.type === 'table' || s.type === 'view') return 1 + closeness / 100
        /* eslint-enable @stylistic/no-mixed-operators */

        return closeness
      }),
    )

    return {suggestions: suggestions.slice(0, 100)}
  }

  return {parse, suggest}
}

const getCloseness = (text: string, currentWord: string): number => {
  if (text === currentWord) return 9
  if (text.startsWith(currentWord)) return 10
  const parts = text.split(/\W+/).filter(Boolean)

  if (parts.length > 1) {
    const closeness = Math.min(...parts.map(p => getCloseness(p, currentWord)))
    if (typeof closeness === 'number') return closeness + 0.1
  }

  if (text.includes(currentWord)) return 11

  return 100
}

const wsqlNoDice = ({errors, ...rest}: wsqla.AutocompleteParseResult) => {
  return Object.values(rest).every(v => !v || (Array.isArray(v) && v.length === 0))
}

const groupBy = <T>(arr: T[], getKey: (item: T) => string) => {
  const record = {} as Record<string, T[]>
  for (const item of arr) {
    const key = getKey(item)
    record[key] ||= []
    record[key].push(item)
  }

  return record
}

// const relationTypeWords: Record<AllRelationTypes, string> = {}
