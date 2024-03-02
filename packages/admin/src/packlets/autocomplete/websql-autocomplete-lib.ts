// copied from https://github.com/gravity-ui/websql-autocomplete/blob/main/src/index.ts (permalink: https://github.com/gravity-ui/websql-autocomplete/blob/bf73fae4cc0d3eb3b75d42af69ed8cba31d43592/src/index.ts)
import {
  AutocompleteParseResult,
  CursorPosition,
  parseClickHouseQuery,
  parseMySqlQuery,
  parsePostgreSqlQuery,
} from 'websql-autocomplete'

// not shipped with library: import {lineSeparatorRegex} from 'websql-autocomplete/dist/lib/cursor';
export const lineSeparatorRegex = /\r\n|\n|\r/g

export function parseMySqlQueryWithCursor(queryWithCursor: string): AutocompleteParseResult {
  return parseMySqlQuery(...separateQueryAndCursor(queryWithCursor))
}

export function parsePostgreSqlQueryWithCursor(queryWithCursor: string): AutocompleteParseResult {
  return parsePostgreSqlQuery(...separateQueryAndCursor(queryWithCursor))
}

export function parseClickHouseQueryWithCursor(queryWithCursor: string): AutocompleteParseResult {
  return parseClickHouseQuery(...separateQueryAndCursor(queryWithCursor))
}

// separateQueryAndCursor helps to calculate cursor position based on the pipe symbol `|`.
//
// It adapts human-readable input to c3 readable input, making tests very readable.
// Otherwise, we'd need to manually count line and column positions ourselves, which is very inconvenient for writing tests.
export function separateQueryAndCursor(query: string): [string, CursorPosition] {
  if (lineSeparatorRegex.test(query)) {
    throw new Error(`Newline characters not allowed, but present in query ${query}`)
  }

  const cursorSymbol = '|'
  const [queryBeforeCursor, queryAfterCursor, ...excessQueries] = query.split(cursorSymbol)

  if (excessQueries.length > 0) {
    throw new Error(`Multiple cursors not allowed, but present in query ${query}`)
  }

  if (queryBeforeCursor === undefined || queryAfterCursor === undefined) {
    throw new Error(`Cursor not provided for query ${query}`)
  }

  return [queryBeforeCursor + queryAfterCursor, {line: 1, column: queryBeforeCursor.length + 1}]
}
