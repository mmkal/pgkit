import pgPromise from 'pg-promise'
import {QueryError} from './errors'
import {nameQuery} from './naming'
import {StandardSchemaV1} from './standard-schema/contract'
import {looksLikeStandardSchema, looksLikeStandardSchemaFailure} from './standard-schema/utils'
import {pgkitStorage} from './storage'
import {
  SQLTagFunction,
  SQLMethodHelpers,
  SQLQuery,
  SQLTagHelpers,
  SQLParameter,
  AwaitSqlResultArray,
  Queryable,
  AwaitableSQLQuery,
  SQLTag,
} from './types'

/** a monadish `.map` which allows for promises or regular values and becomes a promise-or-regular-value with the return type of the mapper */
const maybeAsyncMap = <T, U>(thing: T | Promise<T>, map: (value: T) => U): U | Promise<U> => {
  if (typeof (thing as {then?: unknown})?.then === 'function') {
    return (thing as {then: (mapper: typeof map) => Promise<U>}).then(map)
  }
  return map(thing as T)
}

/**
 * Template tag function. Walks through each string segment and parameter, and concatenates them into a valid SQL query.
 */
const sqlFn: SQLTagFunction = (strings, ...templateParameters) => {
  return sqlFnInner({}, strings, ...templateParameters)
}

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
  type: typer(undefined, sqlFn),
}

function typer(client: Queryable | undefined, sqlFnImpl: typeof sqlFn): SQLMethodHelpers['type'] {
  return <Row extends {}>(type: StandardSchemaV1<Row>) => {
    if (!looksLikeStandardSchema(type)) {
      const typeName = (type as {})?.constructor?.name
      const hint = typeName?.includes('Zod') ? ` Try upgrading zod to v3.24.0 or greater` : ''
      throw new Error(`Invalid type parser. Must be a Standard Schema. Got ${typeName}.${hint}`, {
        cause: type,
      })
    }
    const {validate} = type['~standard']
    const parseFn = (input: unknown) => {
      return maybeAsyncMap(validate(input), result => {
        if (looksLikeStandardSchemaFailure(result)) throw result as {} as Error
        return result.value
      })
    }
    return (strings, ...parameters) => {
      const {then, parse, ...rest} = sqlFnImpl(strings, ...parameters)
      const baseQuery = {...rest, parse: parseFn}
      // eslint-disable-next-line unicorn/no-thenable
      return {...baseQuery, then: getThenFn<Row>({client, sqlQuery: baseQuery})}
    }
  }
}

const sqlFnInner = (
  {priorValues = 0, client = undefined as Queryable | undefined, parse = (x => x) as SQLQuery<never>['parse']},
  strings: TemplateStringsArray,
  ...templateParameters: SQLParameter[]
): SQLQuery<never> & {then: <U>(callback: (rows: Promise<AwaitSqlResultArray<never>>) => U) => Promise<U>} => {
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
        values.push(param.args[0])
        segments.push(getValuePlaceholder(), `::${param.args[1]}[]`)
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
            const innerArgs = value.templateArgs() as Parameters<SQLTagFunction>
            const innerResult = sqlFnInner({priorValues: values.length + priorValues}, ...innerArgs)
            segments.push(...innerResult.segments())
            values.push(...innerResult.values)
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

  const sqlQuery: SQLQuery<never> = {
    parse,
    name: nameQuery(strings),
    sql: segments.join(''),
    token: 'sql',
    values,
    segments: () => segments,
    templateArgs: () => [strings, ...templateParameters],
  }
  return {
    ...sqlQuery,
    // eslint-disable-next-line unicorn/no-thenable
    then: getThenFn({client, sqlQuery}),
  }
}

function getThenFn<X extends {}>({client, sqlQuery}: {client: Queryable | undefined; sqlQuery: SQLQuery<X>}) {
  return <U>(onSuccess: (rows: Promise<AwaitSqlResultArray<never>>) => U) => {
    const getAwaitSqlResultArrayAsync = async (): Promise<AwaitSqlResultArray<never>> => {
      const queryable = client || pgkitStorage.getStore()?.client
      if (!queryable) {
        const msg =
          'No client provided to sql tag - either use `createSqlTag({client})` or provide it with `pgkitStorage.run({client}, () => ...)`'
        throw new Error(msg)
      }
      return queryable.any(sqlQuery).then(rows => {
        const errorParams: QueryError.Params = {query: sqlQuery, result: {rows}}
        const getOne = () => {
          if (rows.length !== 1) throw new QueryError(`Expected 1 row, got ${rows.length}`, errorParams)
          return rows[0]
        }
        const getMany = () => {
          if (rows.length === 0) throw new QueryError('Expected at least 1 row, got 0', errorParams)
          return rows
        }
        Object.defineProperties(rows, {
          one: {
            get: getOne,
          },
          maybeOne: {
            get() {
              if (rows.length > 1) throw new QueryError(`Expected either 0 or 1 row, got ${rows.length}`, errorParams)
              return rows.length === 1 ? rows[0] : null
            },
          },
          oneFirst: {
            get() {
              return Object.values(getOne())[0]
            },
          },
          maybeOneFirst: {
            get() {
              return rows.length === 1 ? Object.values(rows[0])[0] : null
            },
          },
          many: {get: getMany},
          manyFirst: {
            get() {
              return getMany().map(row => Object.values(row)[0])
            },
          },
          noNulls: {
            get() {
              for (const [i, row] of rows.entries()) {
                for (const [key, value] of Object.entries(row)) {
                  if (value === null) throw new QueryError(`Null value at row ${i} column ${key}`, errorParams)
                }
              }
              return rows
            },
          },
        })
        // eslint-disable-next-line promise/no-callback-in-promise
        return rows as AwaitSqlResultArray<never>
      })
    }
    return getAwaitSqlResultArrayAsync().then(
      value => onSuccess(Promise.resolve(value)),
      error => onSuccess(Promise.reject(error as Error)),
    )
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

export const sql: SQLTag = Object.assign(sqlFn, allSqlHelpers)

// export function createSqlTag<TypeAliases extends Record<string, StandardSchemaV1>>(params: {typeAliases: TypeAliases})
export const createSqlTag = <TypeAliases extends Record<string, StandardSchemaV1>>(params: {
  typeAliases?: TypeAliases
  client?: Queryable
}) => {
  // eslint-disable-next-line func-name-matching, func-names, @typescript-eslint/no-shadow
  const fn = function sql(...args: Parameters<SQLTagFunction>) {
    return sqlFnInner(params, ...args)
  } as <Row = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...parameters: Row extends {'~parameters': SQLParameter[]} ? Row['~parameters'] : SQLParameter[]
  ) => AwaitableSQLQuery<Row extends {'~parameters': SQLParameter[]} ? Omit<Row, '~parameters'> : Row>

  const {type, ...rest} = allSqlHelpers

  return Object.assign(
    fn,
    rest,
    {type: typer(params.client, (...args) => sqlFnInner(params, ...args))},
    {
      typeAlias<K extends keyof TypeAliases>(name: K) {
        const schema = params.typeAliases?.[name]
        if (!schema) throw new Error(`Type alias ${name as string} not found`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type Result = typeof schema extends StandardSchemaV1<any, infer R> ? R : never
        return sql.type(schema) as <Parameters extends SQLParameter[] = SQLParameter[]>(
          strings: TemplateStringsArray,
          ...parameters: Parameters
        ) => SQLQuery<Result>
      },
    },
  )
}
