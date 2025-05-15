import pgPromise from 'pg-promise'
import {QueryError} from './errors'
import {nameQuery} from './naming'
import {StandardSchemaV1} from './standard-schema/contract'
import {looksLikeStandardSchema, looksLikeStandardSchemaFailure} from './standard-schema/utils'
import {SQLTagFunction, SQLMethodHelpers, SQLQuery, SQLTagHelpers, SQLParameter} from './types'

const sqlMethodHelpers: SQLMethodHelpers = {
  raw: <T>(query: string, values: unknown[] = []): SQLQuery<T, unknown[]> => ({
    sql: query,
    parse: input => input as T,
    name: nameQuery([query]),
    token: 'sql',
    values,
    segments: () => [query],
    templateArgs: () => [[query]],
  }),
  type: type => {
    if (!looksLikeStandardSchema(type)) {
      throw new Error('Invalid type parser. Must be a Standard Schema', {cause: type})
    }
    const {validate} = type['~standard']
    const parseAsync = async (input: unknown) => {
      const result = await validate(input)
      if (looksLikeStandardSchemaFailure(result)) {
        throw result as {} as Error
      }
      return result.value as never
    }
    // type Result = typeof type extends ZodesqueType<infer R> ? R : never
    // let parseAsync: (input: unknown) => Promise<Result>
    // if ('parseAsync' in type) {
    //   parseAsync = type.parseAsync
    // } else if ('safeParseAsync' in type) {
    //   parseAsync = async input => {
    //     const parsed = await type.safeParseAsync(input)
    //     if (!parsed.success) {
    //       throw parsed.error
    //     }
    //     return parsed.data
    //   }
    // } else if ('parse' in type) {
    //   parseAsync = async input => type.parse(input)
    // } else if ('safeParse' in type) {
    //   parseAsync = async input => {
    //     const parsed = type.safeParse(input)
    //     if (!parsed.success) {
    //       throw parsed.error
    //     }
    //     return parsed.data
    //   }
    // } else {
    //   const _: never = type
    //   throw new Error('Invalid type parser. Must have parse, safeParse, parseAsync or safeParseAsync method', {
    //     cause: type,
    //   })
    // }
    return (strings, ...parameters) => ({
      ...sqlFn(strings, ...(parameters as never)),
      parse: parseAsync,
    })
  },
}

/**
 * Template tag function. Walks through each string segment and parameter, and concatenates them into a valid SQL query.
 */
const sqlFn: SQLTagFunction = (strings, ...templateParameters) => {
  return sqlFnInner({}, strings, ...templateParameters)
}

const sqlFnInner = (
  {priorValues = 0},
  strings: TemplateStringsArray,
  ...templateParameters: SQLParameter[]
): SQLQuery<never> => {
  const segments: string[] = []
  const values: unknown[] = []
  const getValuePlaceholder = (inc = 0) => '$' + (values.length + priorValues + inc)

  // eslint-disable-next-line complexity
  strings.forEach((string, i) => {
    segments.push(string)
    if (!(i in templateParameters)) {
      return
    }

    const param = templateParameters[i]
    if (!param || typeof param !== 'object') {
      values.push(param ?? null)
      segments.push(getValuePlaceholder())
      return
    }

    switch (param.token) {
      case 'array': {
        if (Math.random()) {
          values.push(param.args[0])
          segments.push(getValuePlaceholder(), `::${param.args[1]}[]`)
          break
        }
        // console.log('param', param)
        segments.push(`array[`)
        for (const [i, v] of param.args[0].entries()) {
          if (i > 0) segments.push(', ')
          values.push(v)
          segments.push(`${getValuePlaceholder()}::${param.args[1]}`)
        }
        segments.push(']')
        // values.push(param.args[0])
        // segments.push(getValuePlaceholder())
        break
      }
      case 'binary':
      case 'date':
      case 'json':
      case 'jsonb':
      case 'timestamp': {
        values.push(param.args[0])
        segments.push(getValuePlaceholder())
        break
      }

      case 'literalValue': {
        segments.push(pgPromise.as.value(param.args[0]))
        break
      }

      case 'interval': {
        segments.push('make_interval(')
        Object.entries(param.args[0]).forEach(([unit, value], j, {length}) => {
          values.push(unit)
          segments.push(getValuePlaceholder() + ':name')
          values.push(value)
          segments.push(` => ${getValuePlaceholder()}`)
          if (j < length - 1) segments.push(', ')
        })
        segments.push(')')
        break
      }

      case 'join': {
        param.args[0].forEach((value, j, {length}) => {
          if (value && typeof value === 'object' && value?.token === 'sql') {
            segments.push(value.sql)
            if (j < length - 1) segments.push(param.args[1].sql)
            return
          }

          values.push(value)
          segments.push(getValuePlaceholder())
          if (j < length - 1) segments.push(param.args[1].sql)
        })
        break
      }

      case 'identifier': {
        param.args[0].forEach((name, j, {length}) => {
          values.push(name)
          segments.push(getValuePlaceholder() + ':name')
          if (j < length - 1) segments.push('.')
        })
        break
      }

      case 'unnest': {
        segments.push('unnest(')
        param.args[1].forEach((typename, j, {length}) => {
          const valueArray = param.args[0].map(tuple => tuple[j])
          values.push(valueArray)
          segments.push(getValuePlaceholder() + '::' + typename + '[]')
          if (j < length - 1) segments.push(', ')
        })
        segments.push(')')
        break
      }

      case 'fragment': {
        const innerResult = sqlFnInner({priorValues: values.length}, ...(param.args as Parameters<SQLTagFunction>))
        segments.push(...innerResult.segments())
        values.push(...innerResult.values)
        break
      }

      case 'sql': {
        const innerArgs = param.templateArgs() as Parameters<SQLTagFunction>
        const innerResult = sqlFnInner({priorValues: values.length}, ...innerArgs)
        segments.push(...innerResult.segments())
        values.push(...innerResult.values)
        break
      }

      default: {
        // satisfies never ensures exhaustive
        const unexpected = param satisfies never as (typeof templateParameters)[number]
        throw new QueryError(
          `Unknown type ${unexpected && typeof unexpected === 'object' ? unexpected.token : typeof unexpected}`,
          {query: {name: nameQuery(strings), sql: segments.join(''), values: templateParameters}},
        )
      }
    }
  })

  return {
    parse: input => input as never,
    name: nameQuery(strings),
    sql: segments.join(''),
    token: 'sql',
    values,
    segments: () => segments,
    templateArgs: () => [strings, ...templateParameters],
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
export const createSqlTag = <TypeAliases extends Record<string, StandardSchemaV1>>(params: {
  typeAliases: TypeAliases
}) => {
  // eslint-disable-next-line func-name-matching, func-names, @typescript-eslint/no-shadow
  const fn = function sql(...args: Parameters<SQLTagFunction>) {
    return sqlFn<{}>(...args)
  } as SQLTagFunction

  return Object.assign(fn, allSqlHelpers, {
    typeAlias<K extends keyof TypeAliases>(name: K) {
      const type = params.typeAliases[name]
      type Result = typeof type extends StandardSchemaV1<any, infer R> ? R : never
      return sql.type(type) as <Parameters extends SQLParameter[] = SQLParameter[]>(
        strings: TemplateStringsArray,
        ...parameters: Parameters
      ) => SQLQuery<Result>
    },
  })
}
