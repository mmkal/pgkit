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

// Extract meaningful parts from SQL
const extractSqlParts = (sql: string): string[] => {
  const tokens = tokenize(sql.toLowerCase())
  const parts: string[] = []
  
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]
    const nextToken = tokens[i + 1]
    const nextToken2 = tokens[i + 2]

    // Handle compound keywords
    if (token === 'alter' && nextToken === 'table') {
      parts.push('alter_table')
      i += 2
      continue
    }
    if (token === 'create' && nextToken === 'table') {
      parts.push('create_table')
      i += 2
      continue
    }
    if (token === 'add' && nextToken === 'column') {
      parts.push('add_column')
      i += 2
      continue
    }

    // Handle single keywords
    if (keywordsToInclude.has(token)) {
      parts.push(token)
      
      // Special case: add "from" after delete
      if (token === 'delete') {
        parts.push('from')
      }
    }

    // Handle table/column names after keywords
    if (['from', 'join', 'into', 'table', 'update'].includes(token) && nextToken && 
        !keywordsToInclude.has(nextToken) && nextToken !== '(' && nextToken !== ')') {
      // Handle quoted identifiers
      if (nextToken.startsWith('"') && nextToken.endsWith('"')) {
        parts.push(nextToken.slice(1, -1))
      } else if (nextToken.startsWith('`') && nextToken.endsWith('`')) {
        parts.push(nextToken.slice(1, -1))
      } else if (!['on', 'where', 'set', 'values', 'select'].includes(nextToken)) {
        parts.push(nextToken)
      }
    }

    // Handle CTE names (WITH clause)
    if (token === 'with' && nextToken && !keywordsToInclude.has(nextToken)) {
      parts.push(nextToken)
    }

    // Handle aliases and CTEs in WITH clause
    if (tokens[i - 1] === ',' && 
        !keywordsToInclude.has(token) && 
        token !== '(' && token !== ')' &&
        // Look back to see if we're in a WITH clause
        tokens.slice(Math.max(0, i - 10), i).some(t => t === 'with')) {
      parts.push(token)
    }

    // Handle SET clause column names
    if (token === 'set' && nextToken && 
        !keywordsToInclude.has(nextToken) && nextToken !== '(') {
      parts.push('set')
      if (nextToken !== '=') {
        parts.push(nextToken)
      }
    }

    i++
  }

  return parts
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