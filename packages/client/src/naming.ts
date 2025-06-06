import * as crypto from 'node:crypto'

const keywordsToInclude = new Set([
  'select', 'insert', 'update', 'delete', 'create', 'drop', 'alter', 
  'truncate', 'grant', 'revoke', 'begin', 'commit', 'rollback', 
  'savepoint', 'release', 'with', 'alter table', 'create table', 'add column'
])

// Simple SQL tokenizer
const tokenize = (sql: string): string[] => {
  // Remove comments and normalize whitespace
  const cleaned = sql
    .replace(/--.*$/gm, '') // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\s+/g, ' ')
    .trim()

  const tokens: string[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''
  let inIdentifier = false

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i]
    const nextChar = cleaned[i + 1]

    if (!inQuotes && !inIdentifier) {
      if (char === '"' || char === "'") {
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
        inQuotes = true
        quoteChar = char
        current = char
      } else if (char === '`') {
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
        inIdentifier = true
        current = char
      } else if (/\s/.test(char)) {
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
      } else if ('(),;'.includes(char)) {
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
        tokens.push(char)
      } else {
        current += char
      }
    } else if (inQuotes) {
      current += char
      if (char === quoteChar && cleaned[i - 1] !== '\\') {
        tokens.push(current)
        current = ''
        inQuotes = false
        quoteChar = ''
      }
    } else if (inIdentifier) {
      current += char
      if (char === '`') {
        tokens.push(current)
        current = ''
        inIdentifier = false
      }
    }
  }

  if (current.trim()) {
    tokens.push(current.trim())
  }

  return tokens
}

// Helper function to clean identifier names
const cleanIdentifier = (name: string): string => {
  if (name.startsWith('"') && name.endsWith('"')) {
    return name.slice(1, -1)
  }
  if (name.startsWith('`') && name.endsWith('`')) {
    return name.slice(1, -1)
  }
  return name
}

// Extract meaningful parts from SQL with improved semantic understanding
const extractSqlParts = (sql: string): string[] => {
  const tokens = tokenize(sql.toLowerCase())
  const parts: string[] = []
  
  let i = 0
  const allTokens = tokens.join(' ')
  
  // Pre-analysis: detect patterns that should influence the nickname
  const hasCount = /count\s*\(/i.test(allTokens)
  const hasSum = /sum\s*\(/i.test(allTokens)
  const hasAvg = /avg\s*\(/i.test(allTokens)
  const hasMax = /max\s*\(/i.test(allTokens)
  const hasMin = /min\s*\(/i.test(allTokens)
  const hasAggregates = hasCount || hasSum || hasAvg || hasMax || hasMin
  const hasJoin = /\bjoin\b/i.test(allTokens)
  const hasLeftJoin = /left\s+join/i.test(allTokens)
  const hasInnerJoin = /inner\s+join/i.test(allTokens)
  const hasGroupBy = /group\s+by/i.test(allTokens)
  const hasOrderBy = /order\s+by/i.test(allTokens)
  const hasLimit = /\blimit\b/i.test(allTokens)
  const hasOffset = /\boffset\b/i.test(allTokens)
  const hasUnion = /\bunion\b/i.test(allTokens)
  const hasReturning = /\breturning\b/i.test(allTokens)
  const hasOnConflict = /on\s+conflict/i.test(allTokens)
  const hasValues = /\bvalues\b/i.test(allTokens)
  const hasJsonb = /jsonb_populate_recordset|jsonb_to_recordset/i.test(allTokens)
  const hasUnnest = /\bunnest\b/i.test(allTokens)
  const hasWith = /\bwith\b/i.test(allTokens)
  const isTransaction = /\b(begin|commit|rollback|savepoint)\b/i.test(allTokens)
  
  while (i < tokens.length) {
    const token = tokens[i]
    const nextToken = tokens[i + 1]
    const nextToken2 = tokens[i + 2]
    const prevToken = tokens[i - 1]

    // Handle main operation keywords first
    if (token === 'select') {
      if (hasCount && !hasGroupBy) {
        parts.push('count')
      } else if (hasSum) {
        parts.push('sum')
      } else if (hasAvg) {
        parts.push('avg')
      } else if (hasMax) {
        parts.push('max')
      } else if (hasMin) {
        parts.push('min')
      } else if (hasAggregates && hasGroupBy) {
        parts.push('aggregate')
      } else {
        parts.push('select')
      }
    } else if (token === 'insert') {
      if (hasJsonb) {
        parts.push('bulk_insert')
      } else if (hasUnnest) {
        parts.push('bulk_insert')
      } else if (hasOnConflict) {
        parts.push('upsert')
      } else {
        parts.push('insert')
      }
    } else if (token === 'update') {
      parts.push('update')
    } else if (token === 'delete') {
      parts.push('delete')
      if (nextToken === 'from') {
        parts.push('from')
        i++ // skip the 'from' token
      }
    } else if (token === 'create' && nextToken === 'table') {
      parts.push('create_table')
      i++ // skip 'table'
    } else if (token === 'drop' && nextToken === 'table') {
      parts.push('drop_table')
      i++ // skip 'table'
    } else if (token === 'alter' && nextToken === 'table') {
      parts.push('alter_table')
      i++ // skip 'table'
    } else if (token === 'create' && nextToken === 'database') {
      parts.push('create_db')
      i++ // skip 'database'
    } else if (token === 'drop' && nextToken === 'database') {
      parts.push('drop_db')
      i++ // skip 'database'
    } else if (token === 'create' && nextToken === 'index') {
      parts.push('create_index')
      i++ // skip 'index'
    } else if (token === 'with' && nextToken && !keywordsToInclude.has(nextToken)) {
      parts.push('with')
      // Add CTE name
      const cteName = cleanIdentifier(nextToken)
      if (cteName && cteName !== '(' && !cteName.startsWith('$')) {
        parts.push(cteName)
      }
    } else if (keywordsToInclude.has(token)) {
      parts.push(token)
    }

    // Handle table names and important identifiers
    if (['from', 'join', 'into', 'table', 'update'].includes(token) && nextToken) {
      const tableName = cleanIdentifier(nextToken)
      if (tableName && 
          !keywordsToInclude.has(tableName) && 
          tableName !== '(' && 
          tableName !== ')' &&
          !tableName.startsWith('$') &&
          !['on', 'where', 'set', 'values', 'select', 'as'].includes(tableName)) {
        parts.push(tableName)
      }
    }

    // Handle SET clause with more context
    if (token === 'set' && nextToken && 
        !keywordsToInclude.has(nextToken) && 
        nextToken !== '(' &&
        !nextToken.startsWith('$')) {
      parts.push('set')
      // Try to extract column name
      const columnName = cleanIdentifier(nextToken)
      if (columnName && columnName !== '=' && !columnName.includes('(')) {
        parts.push(columnName)
      }
    }

    // Handle JOIN types
    if (token === 'join' && !parts.includes('join')) {
      if (hasLeftJoin) {
        parts.push('left_join')
      } else if (hasInnerJoin) {
        parts.push('inner_join')
      } else {
        parts.push('join')
      }
      
      // Add joined table name
      if (nextToken) {
        const tableName = cleanIdentifier(nextToken)
        if (tableName && 
            !keywordsToInclude.has(tableName) && 
            tableName !== '(' && 
            !tableName.startsWith('$')) {
          parts.push(tableName)
        }
      }
    }

    // Handle WHERE conditions with some context
    if (token === 'where') {
      // Look ahead to see what kind of condition
      const nextFewTokens = tokens.slice(i + 1, i + 5).join(' ')
      if (/id\s*=/.test(nextFewTokens) || /\$\d+/.test(nextFewTokens)) {
        parts.push('by_id')
      } else if (hasLimit && nextFewTokens.includes('>=')) {
        parts.push('filtered')
      } else if (nextFewTokens.includes('any(') || nextFewTokens.includes('in(')) {
        parts.push('by_list')
      } else if (nextFewTokens.length > 0) {
        parts.push('filtered')
      }
    }

    // Handle ORDER BY, GROUP BY, LIMIT
    if (token === 'order' && nextToken === 'by') {
      parts.push('ordered')
      i++ // skip 'by'
    } else if (token === 'group' && nextToken === 'by') {
      parts.push('grouped')
      i++ // skip 'by'
    } else if (token === 'limit') {
      parts.push('limited')
    }

    // Handle RETURNING
    if (token === 'returning') {
      parts.push('returning')
    }

    // Handle transaction keywords
    if (isTransaction && ['begin', 'commit', 'rollback', 'savepoint'].includes(token)) {
      parts.push(token)
    }

    // Handle additional CTE names in WITH clause
    if (prevToken === ',' && 
        !keywordsToInclude.has(token) && 
        token !== '(' && 
        token !== ')' &&
        !token.startsWith('$') &&
        // Look back to see if we're in a WITH clause
        tokens.slice(Math.max(0, i - 10), i).some(t => t === 'with')) {
      const cteName = cleanIdentifier(token)
      if (cteName) {
        parts.push(cteName)
      }
    }

    i++
  }

  // Post-processing: remove redundant parts and add semantic meaning
  const uniqueParts = [...new Set(parts)]
  
  // Add semantic context
  if (hasReturning && !uniqueParts.includes('returning')) {
    uniqueParts.push('returning')
  }
  
  return uniqueParts
}

const joinUntil = (parts: string[], delimiter: string, {length}: {length: number}) => {
  let acc = ''
  for (const part of parts) {
    const cleanPart = part.replaceAll(/\W+/g, '_')
    if (acc.length + cleanPart.length + delimiter.length > length) break
    acc += (acc ? delimiter : '') + cleanPart
  }
  return acc
}

export const nickname = (query: string, {debugAst = false} = {}) => {
  const parts = extractSqlParts(query)
  
  if (debugAst) {
    console.log('Extracted parts:', parts)
  }

  const result = joinUntil(parts, '-', {length: 63})
  
  // Fallback to just the first keyword if no meaningful parts extracted
  if (!result) {
    const firstKeyword = /(select|insert|update|delete|create|drop|alter|truncate|grant|revoke|begin|commit|rollback|savepoint|release|with)/i.exec(query.trim())?.[0]?.toLowerCase()
    return firstKeyword || 'sql'
  }
  
  return result
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