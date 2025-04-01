import pgPromise from 'pg-promise'
import {QueryError} from './errors'
import {nameQuery} from './naming'
import type {SQLTagFunction, SQLMethodHelpers, SQLQuery, SQLTagHelpers, ZodesqueType, SQLParameter, SqlFragment, SQLTagHelperParameters} from './types'

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
    return (strings, ...parameters) => ({
      ...sqlFn(strings, ...(parameters as never)),
      parse: parseAsync,
    })
  },
}

/**
 * Template tag function. Walks through each string segment and parameter, and concatenates them into a valid SQL query.
 */
const sqlFn: SQLTagFunction = (
  strings: TemplateStringsArray,
  ...templateParameters: SQLParameter[]
): SQLQuery<never> => {
  const segments: string[] = []
  const values: unknown[] = []

  // eslint-disable-next-line complexity
  strings.forEach((string, i) => {
    segments.push(string)
    if (!(i in templateParameters)) {
      return
    }

    const param = templateParameters[i]
    if (!param || typeof param !== 'object') {
      values.push(param ?? null)
      segments.push('$' + values.length)
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
        segments.push('$' + values.length)
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
          segments.push('$' + values.length + ':name')
          values.push(value)
          segments.push(` => $${values.length}`)
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
          segments.push('$' + values.length)
          if (j < length - 1) segments.push(param.args[1].sql)
        })
        break
      }

      case 'identifier': {
        param.args[0].forEach((name, j, {length}) => {
          values.push(name)
          segments.push('$' + values.length + ':name')
          if (j < length - 1) segments.push('.')
        })
        break
      }

      case 'unnest': {
        segments.push('unnest(')
        param.args[1].forEach((typename, j, {length}) => {
          const valueArray = param.args[0].map(tuple => tuple[j])
          values.push(valueArray)
          segments.push('$' + values.length + '::' + typename + '[]')
          if (j < length - 1) segments.push(', ')
        })
        segments.push(')')
        break
      }

      case 'fragment': {
        const [parts, ...fragmentValues] = param.args;
        const baseIndex = values.length;
        let fragmentSql = '';
        let paramCounter = 1;

        for (const [j, part] of parts.entries()) {
          // Handle any existing parameter numbers in the fragment
          const adjustedPart = part.replace(/\$(\d+)/g, (match, num) => {
            return `$${baseIndex + paramCounter++}`;
          });
          fragmentSql += adjustedPart;

          if (j < fragmentValues.length) {
            const fragmentValue = fragmentValues[j];
            if (fragmentValue && typeof fragmentValue === 'object') {
              if (fragmentValue.token === 'sql') {
                // Handle nested SQL objects
                const nestedSql = fragmentValue.sql.replace(/\$(\d+)/g, (match, num) => {
                  return `$${baseIndex + paramCounter++}`;
                });
                fragmentSql += nestedSql;
                values.push(...(fragmentValue as SqlFragment).values);
              } else if (fragmentValue.token === 'array') {
                // Handle array values
                const arrayParam = fragmentValue as unknown as {
                  token: 'array';
                  args: [values: readonly unknown[], memberType: string];
                };
                values.push(arrayParam.args[0]);
                fragmentSql += `$${values.length}::${arrayParam.args[1]}[]`;
              } else if (fragmentValue.token === 'fragment') {
                // Handle nested fragments by recursively processing them
                const nestedFragment = sqlFn`${fragmentValue}`;
                const nestedSql = nestedFragment.sql.replace(/\$(\d+)/g, (match, num) => {
                  return `$${baseIndex + paramCounter++}`;
                });
                fragmentSql += nestedSql;
                values.push(...nestedFragment.values);
              } else {
                values.push(fragmentValue);
                fragmentSql += `$${values.length}`;
              }
            } else {
              values.push(fragmentValue);
              fragmentSql += `$${values.length}`;
            }
          }
        }
        segments.push(fragmentSql);
        break;
      }

      case 'sql': {
        // Handle nested SQL objects properly
        if (param.values && Array.isArray(param.values)) {
          // This is a direct SQL object
          const baseIndex = values.length;
          const paramSql = param.sql.replace(/\$(\d+)/g, (match, num) => {
            return `$${baseIndex + Number.parseInt(num)}`;
          });
          segments.push(paramSql);
          for (const val of param.values) {
            if (val && typeof val === 'object' && 'token' in val && val.token === 'array') {
              // Handle nested array objects
              const arrayParam = val as unknown as {
                token: 'array';
                args: [values: readonly unknown[], memberType: string];
              };
              values.push(arrayParam.args[0]);
            } else {
              values.push(val);
            }
          }
        } else {
          // This is a template-based SQL object
          const [parts, ...fragmentValues] = param.templateArgs();
          for (const [j, part] of parts.entries()) {
            segments.push(part);
            if (j < fragmentValues.length) {
              const fragmentValue = fragmentValues[j];
              if (fragmentValue && typeof fragmentValue === 'object' && 'token' in fragmentValue && fragmentValue.token === 'array') {
                const arrayParam = fragmentValue as unknown as {
                  token: 'array';
                  args: [values: readonly unknown[], memberType: string];
                };
                values.push(arrayParam.args[0]);
                segments.push(`$${values.length}::${arrayParam.args[1]}[]`);
              } else {
                values.push(fragmentValue);
                segments.push(`$${values.length}`);
              }
            }
          }
        }
        break;
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
export const createSqlTag = <TypeAliases extends Record<string, ZodesqueType<any>>>(params: {
  typeAliases: TypeAliases
}) => {
  // eslint-disable-next-line func-name-matching, func-names, @typescript-eslint/no-shadow
  const fn = function sql(...args: Parameters<SQLTagFunction>) {
    return sqlFn<{}>(...args)
  } as SQLTagFunction

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
