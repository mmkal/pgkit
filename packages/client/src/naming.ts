import * as crypto from 'node:crypto'

/**
 * Tokenize SQL into a flat list of words and punctuation.
 * Handles: quoted identifiers ("Foo"), single-quoted strings ('bar'), double-dash comments, block comments, parentheses.
 */
const tokenize = (sql: string): string[] => {
  const tokens: string[] = []
  let i = 0
  while (i < sql.length) {
    // skip whitespace
    if (/\s/.test(sql[i])) {
      i++
      continue
    }

    // line comment
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      continue
    }

    // block comment
    if (sql[i] === '/' && sql[i + 1] === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2
      continue
    }

    // quoted identifier "..."
    if (sql[i] === '"') {
      i++
      let ident = ''
      while (i < sql.length && sql[i] !== '"') {
        ident += sql[i]
        i++
      }
      i++ // skip closing "
      tokens.push(ident)
      continue
    }

    // string literal '...' — skip entirely
    if (sql[i] === "'") {
      i++
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2 // escaped quote
        } else if (sql[i] === "'") {
          i++
          break
        } else {
          i++
        }
      }
      continue
    }

    // punctuation: parentheses, semicolons, commas, operators
    if ('();,=<>!+-*/.'.includes(sql[i])) {
      tokens.push(sql[i])
      i++
      continue
    }

    // word (keyword or identifier)
    if (/[\w$]/.test(sql[i])) {
      let word = ''
      while (i < sql.length && /[\w$]/.test(sql[i])) {
        word += sql[i]
        i++
      }
      tokens.push(word)
      continue
    }

    // anything else, skip
    i++
  }

  return tokens
}

/** Keywords that mark a statement type we want to capture in the nickname */
const statementKeywords = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'create',
  'drop',
  'alter',
  'truncate',
  'grant',
  'revoke',
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'release',
  'with',
])

/** Keywords after which the next identifier is a table/object name we want */
const tableIntroducers = new Set(['from', 'into', 'update', 'join', 'table'])

/**
 * Extract a short nickname from a SQL query string.
 * Walks through tokens positionally — no full AST needed.
 * Only processes the first statement (stops at first `;`).
 */
export const nickname = (query: string) => {
  const sqlTokens = tokenize(query)
  const parts: string[] = []
  let depth = 0 // track parenthesis depth to skip subqueries

  for (let i = 0; i < sqlTokens.length; i++) {
    const tok = sqlTokens[i]

    // stop at first semicolon (only nickname the first statement)
    if (tok === ';') break

    if (tok === '(') {
      depth++
      continue
    }

    if (tok === ')') {
      depth = Math.max(0, depth - 1)
      continue
    }

    // skip everything inside parentheses (subqueries, value lists, column defs, etc.)
    if (depth > 0) continue

    const lower = tok.toLowerCase()

    // WITH ... AS — capture CTE names
    if (lower === 'with') {
      parts.push('with')
      // collect CTE names: pattern is `name AS (...), name AS (...)`
      let j = i + 1
      while (j < sqlTokens.length) {
        // skip RECURSIVE keyword
        if (sqlTokens[j].toLowerCase() === 'recursive') {
          j++
          continue
        }

        const cteName = sqlTokens[j]
        // If we hit a statement keyword, the CTEs are done
        if (statementKeywords.has(cteName.toLowerCase()) && cteName.toLowerCase() !== 'with') break

        // Should be: cteName AS (...)
        if (j + 1 < sqlTokens.length && sqlTokens[j + 1].toLowerCase() === 'as') {
          parts.push(cteName)
          j += 2 // skip past 'AS'
          // skip the parenthesized CTE body
          if (j < sqlTokens.length && sqlTokens[j] === '(') {
            let cteDepth = 1
            j++
            while (j < sqlTokens.length && cteDepth > 0) {
              if (sqlTokens[j] === '(') cteDepth++
              if (sqlTokens[j] === ')') cteDepth--
              j++
            }
          }

          // skip comma between CTEs
          if (j < sqlTokens.length && sqlTokens[j] === ',') j++
          continue
        }

        break
      }

      i = j - 1 // will be incremented by for loop
      continue
    }

    // Helper: grab next identifier (non-punctuation token) if present
    const grabName = () => {
      const name = sqlTokens[i + 1]
      if (name && !/^[;,()=<>!+\-*/.]+$/.test(name) && !statementKeywords.has(name.toLowerCase())) {
        parts.push(name)
        i++
      }
    }

    // Statement keywords
    if (statementKeywords.has(lower)) {
      const next = sqlTokens[i + 1]?.toLowerCase()

      // Compound keywords: ALTER TABLE, CREATE TABLE → grab table name
      if ((lower === 'alter' || lower === 'create') && next === 'table') {
        parts.push(lower + '_' + next)
        i++ // skip 'table'
        grabName() // grab the table name
        continue
      }

      parts.push(lower)

      // UPDATE foo — grab the table name
      if (lower === 'update') {
        grabName()
        continue
      }

      // DELETE FROM foo — consume 'from', grab the table name
      if (lower === 'delete') {
        if (sqlTokens[i + 1]?.toLowerCase() === 'from') {
          parts.push('from')
          i++
        }

        grabName()
        continue
      }

      continue
    }

    // Table/object name after FROM, INTO, JOIN, TABLE
    if (tableIntroducers.has(lower)) {
      grabName()
      continue
    }

    // SET in UPDATE ... SET col = val
    if (lower === 'set' && parts.some(p => p === 'update')) {
      parts.push('set')
      grabName()
      continue
    }

    // ADD COLUMN
    if (lower === 'add' && sqlTokens[i + 1]?.toLowerCase() === 'column') {
      parts.push('add_column')
      i++ // skip 'column'
      grabName()
      continue
    }

    // WHERE, ON, HAVING, ORDER BY, GROUP BY, LIMIT — stop collecting from this clause
    // (we don't want filter conditions, just the structural parts)
    if (['where', 'on', 'having', 'order', 'group', 'limit', 'offset', 'returning'].includes(lower)) {
      // skip until we hit another interesting keyword (join, union, etc.) or end
      while (i + 1 < sqlTokens.length) {
        const peekLower = sqlTokens[i + 1].toLowerCase()
        if (
          statementKeywords.has(peekLower) ||
          ['join', 'from', 'into', 'union', 'intersect', 'except'].includes(peekLower) ||
          sqlTokens[i + 1] === ';'
        ) {
          break
        }

        i++
      }

      continue
    }
  }

  return joinUntil(
    parts.map(t => t.replaceAll(/\W+/g, '_')),
    '-',
    {length: 63},
  )
}

const joinUntil = (parts: string[], delimiter: string, {length}: {length: number}) => {
  let acc = ''
  for (const part of parts) {
    if (acc.length + part.length > length) break
    acc += (acc ? delimiter : '') + part
  }

  return acc
}

export const nameQuery = (parts: readonly string[], defaultKeyword = 'sql') => {
  const first = parts[0] || ''
  const explicitName = first.startsWith('--name:')
    ? first.split('\n')[0]?.replace('--name:', '').trim().replaceAll(/\W/g, '_')
    : null
  const keyword =
    /(select|insert|update|delete|create|drop|alter|truncate|grant|revoke|begin|commit|rollback|savepoint|release)/i.exec(
      first?.trim(),
    )?.[0] || defaultKeyword

  return `${explicitName || nickname(first) || keyword}_${crypto.createHash('md5').update(parts.join('')).digest('hex').slice(0, 7)}`
}
