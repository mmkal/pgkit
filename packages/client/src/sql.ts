import pgPromise from 'pg-promise'
import {QueryError} from './errors'
import {nameQuery} from './naming'
import {SQLTagFunction, SQLMethodHelpers, SQLQuery, SQLTagHelpers, ZodesqueType, SQLParameter} from './types'

const sqlMethodHelpers: SQLMethodHelpers = {
  raw: <T>(query: string): SQLQuery<T, []> => ({
    sql: query,
    parse: input => input as T,
    name: nameQuery([query]),
    token: 'sql',
    values: [],
    templateArgs: () => [[query]],
  }),
  type: type => {
    type Result = typeof type extends ZodesqueType<infer R> ? R : never
    let parseAsync: (input: unknown) => Promise<Result>
    if ('parseAsync' in type) {
      parseAsync = type.parseAsync
    } else if ('safeParseAsync' in type) {
      parseAsync = async input => {
        const parsed = await type.safeParseAsync(input)
        if (!parsed.success) {
          throw parsed.error
        }
        return parsed.data
      }
    } else if ('parse' in type) {
      parseAsync = async input => type.parse(input)
    } else if ('safeParse' in type) {
      parseAsync = async input => {
        const parsed = type.safeParse(input)
        if (!parsed.success) {
          throw parsed.error
        }
        return parsed.data
      }
    } else {
      const _: never = type
      throw new Error('Invalid type parser. Must have parse, safeParse, parseAsync or safeParseAsync method', {
        cause: type,
      })
    }
    return (strings, ...parameters) => {
      return {
        parse: parseAsync,
        name: nameQuery(strings),
        sql: strings.join(''),
        token: 'sql',
        values: parameters,
        templateArgs: () => [strings, ...parameters],
      }
    }
  },
}

const sqlFn: SQLTagFunction = (strings, ...inputParameters) => {
  let sql = ''
  const values: unknown[] = []

  // eslint-disable-next-line complexity
  strings.forEach((string, i) => {
    sql += string
    if (!(i in inputParameters)) {
      return
    }

    const param = inputParameters[i]
    if (!param || typeof param !== 'object') {
      values.push(param ?? null)
      sql += '$' + values.length
      return
    }

    switch (param.token) {
      case 'array':
      case 'binary':
      case 'date':
      case 'json':
      case 'jsonb':
      case 'timestamp': {
        values.push(param.args[0])
        sql += '$' + values.length
        break
      }

      case 'literalValue': {
        sql += pgPromise.as.value(param.args[0])
        break
      }

      case 'interval': {
        sql += 'make_interval('
        Object.entries(param.args[0]).forEach(([unit, value], j, {length}) => {
          values.push(unit)
          sql += '$' + values.length + ':name'
          values.push(value)
          sql += ` => $${values.length}`
          if (j < length - 1) sql += ', '
        })
        sql += ')'
        break
      }

      case 'join': {
        param.args[0].forEach((value, j, {length}) => {
          if (value && typeof value === 'object' && value?.token === 'sql') {
            sql += value.sql
            if (j < length - 1) sql += param.args[1].sql
            return
          }

          values.push(value)
          sql += '$' + values.length
          if (j < length - 1) sql += param.args[1].sql
        })
        break
      }

      case 'sql': {
        const [parts, ...fragmentValues] = param.templateArgs()
        for (const [j, part] of parts.entries()) {
          sql += part
          if (j < fragmentValues.length) {
            values.push(fragmentValues[j])
            sql += '$' + String(j + 1)
          }
        }
        break
      }

      case 'identifier': {
        param.args[0].forEach((name, j, {length}) => {
          values.push(name)
          sql += '$' + values.length + ':name'
          if (j < length - 1) sql += '.'
        })
        break
      }

      case 'unnest': {
        sql += 'unnest('
        param.args[1].forEach((typename, j, {length}) => {
          const valueArray = param.args[0].map(tuple => tuple[j])
          values.push(valueArray)
          sql += '$' + values.length + '::' + typename + '[]'
          if (j < length - 1) sql += ', '
        })
        sql += ')'
        break
      }

      case 'fragment': {
        const [parts, ...fragmentValues] = param.args
        for (const [j, part] of parts.entries()) {
          sql += part
          if (j < fragmentValues.length) {
            values.push(fragmentValues[j])
            sql += '$' + String(j + 1)
          }
        }
        break
      }

      default: {
        // satisfies never ensures exhaustive
        const unexpected = param satisfies never as (typeof inputParameters)[number]
        throw new QueryError(
          `Unknown type ${unexpected && typeof unexpected === 'object' ? unexpected.token : typeof unexpected}`,
          {
            cause: {query: {name: nameQuery(strings), sql, values: inputParameters}},
          },
        )
      }
    }
  })

  return {
    parse: input => input as never,
    name: nameQuery(strings),
    sql,
    token: 'sql',
    values,
    templateArgs: () => [strings, ...inputParameters],
  }
}

export const sqlTagHelpers: SQLTagHelpers = {
  array: (...args) => ({token: 'array', args}),
  binary: (...args) => ({token: 'binary', args}),
  date: (...args) => ({token: 'date', args}),
  fragment: (...args) => ({token: 'fragment', args}),
  identifier: (...args) => ({token: 'identifier', args}),
  interval: (...args) => ({token: 'interval', args}),
  join: (...args) => ({token: 'join', args}),
  json: (...args) => ({token: 'json', args}),
  jsonb: (...args) => ({token: 'jsonb', args}),
  literalValue: (...args) => ({token: 'literalValue', args}),
  timestamp: (...args) => ({token: 'timestamp', args}),
  unnest: (...args) => ({token: 'unnest', args}),
}

export const allSqlHelpers = {...sqlMethodHelpers, ...sqlTagHelpers}

export const sql: SQLTagFunction & SQLTagHelpers & SQLMethodHelpers = Object.assign(sqlFn, allSqlHelpers)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createSqlTag = <TypeAliases extends Record<string, ZodesqueType<any>>>(params: {
  typeAliases: TypeAliases
}) => {
  // eslint-disable-next-line func-name-matching, func-names, @typescript-eslint/no-shadow
  const fn: SQLTagFunction = function sql(...args: Parameters<SQLTagFunction>) {
    return sqlFn(...args)
  }

  return Object.assign(fn, allSqlHelpers, {
    typeAlias<K extends keyof TypeAliases>(name: K) {
      const type = params.typeAliases[name]
      type Result = typeof type extends ZodesqueType<infer R> ? R : never
      return sql.type(type) as <Parameters extends SQLParameter[] = SQLParameter[]>(
        strings: TemplateStringsArray,
        ...parameters: Parameters
      ) => SQLQuery<Result>
    },
  })
}
