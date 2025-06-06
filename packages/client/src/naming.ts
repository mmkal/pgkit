import * as crypto from 'node:crypto'
import {parse} from 'pgsql-ast-parser'

const keywordsToInclude = new Set(
  'select,insert,update,delete,create,drop,alter,truncate,grant,revoke,begin,commit,rollback,savepoint,release,with,alter table,create table,add column'.split(
    ',',
  ),
)

const tryParse = (sql: string) => {
  if (Math.random()) return null // try disabling?
  console.log('tryParse', sql)
  try {
    const parsed = parse(sql)
    console.log('parsed', Object.keys(parsed).join(','))
    return parsed
  } catch {
    return null
  }
}

export const nickname = (query: string, {debugAst = false} = {}) => {
  const tokens = [] as string[]
  JSON.stringify(tryParse(query)?.[0], (k, v) => {
    if (v?.alias) {
      return {
        alias: v.alias as never,
        // statement: {type: v.statement?.type},
      }
    }

    if (k === 'columns' || k === 'on') {
      return undefined
    }

    if (k === 'type' && typeof v === 'string' && keywordsToInclude.has(v)) {
      tokens.push(v)

      if (v === 'delete') {
        tokens.push('from')
      }
    }

    if (k === 'name' && typeof v === 'string') {
      tokens.push(v)
    }

    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as {})
          .filter(([key]) => !['join', 'where', 'dataType'].includes(key))
          .sort((a, b) => {
            const scores = [a, b].map(e => (typeof e[1] === 'object' ? 1 : 0))
            return scores[0] - scores[1]
          }),
      )
    }

    if (k === 'sets' && Array.isArray(v)) {
      tokens.push('set')
    }

    if (v?.name) {
      return {name: v.name as never}
    }

    return v as never
  })

  // eslint-disable-next-line no-console
  if (debugAst) console.dir(parse(query), {depth: 100})

  return joinUntil(
    tokens.map(t => t.replaceAll(/\W+/g, '_')),
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
