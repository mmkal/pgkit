import * as assert from 'assert'
import {createHash} from 'crypto'

import * as lodash from 'lodash'
import {SelectFromStatement, Statement} from 'pgsql-ast-parser'
import {singular} from 'pluralize'
import {DatabasePool, sql} from 'slonik'

import {AnalysedQuery, AnalysedQueryField, DescribedQuery, QueryField} from '../types'
import {tryOrDefault} from '../util'
import {ViewResult, getViewResult} from './getViewResult'
import * as parse from './index'
import {
  AliasMapping,
  aliasMappings,
  astToViewFriendlySql,
  getHopefullyViewableAST,
  getSuggestedTags,
  isCTE,
  suggestedTags,
  templateToHopefullyViewableAST,
} from './parse'

export class AnalyseQueryError extends Error {
  public readonly [Symbol.toStringTag] = 'AnalyseQueryError'
  constructor(
    public readonly originalError: Error,
    public readonly query: DescribedQuery,
    public readonly recover?: AnalysedQuery,
  ) {
    super(`Error describing Query: ${originalError.message}`)
  }
}

// todo: logging
// todo: get table description from obj_description(oid) (like column)

export const columnInfoGetter = (pool: DatabasePool) => {
  const addColumnInfo = async (query: DescribedQuery): Promise<AnalysedQuery> => {
    const viewFriendlyAst = templateToHopefullyViewableAST(query.template)

    if (viewFriendlyAst.type !== 'select') {
      return getDefaultAnalysedQuery(query)
    }

    const viewFriendlySql = astToViewFriendlySql(viewFriendlyAst)
    const viewResult = isCTE(query.template)
      ? [] // not smart enough to figure out what types are referenced via a CTE
      : await getViewResult(pool, viewFriendlySql)

    const getFieldInfo = buildGetFieldInfo(viewResult, viewFriendlyAst)

    return {
      ...query,
      suggestedTags: generateTags(query),
      fields: query.fields.map(getFieldInfo),
    }
  }

  return async (query: DescribedQuery): Promise<AnalysedQuery> =>
    addColumnInfo(query).catch(e => {
      const recover = getDefaultAnalysedQuery(query)
      throw new AnalyseQueryError(e, query, recover)
    })
}

const buildGetFieldInfo = (viewResult: ViewResult[], ast: SelectFromStatement) => {
  const viewableAst =
    viewResult[0]?.formatted_query === undefined ? ast : getHopefullyViewableAST(viewResult[0].formatted_query!) // TODO: explore why this fallback might be needed - can't we always use the original ast?

  const mappings = aliasMappings(viewableAst)

  return function getFieldInfo(field: QueryField) {
    const relatedResults = mappings.flatMap(c =>
      viewResult
        .map(v => ({
          ...v,
          hasNullableJoin: c.hasNullableJoin,
        }))
        .filter(v => {
          assert.ok(v.underlying_table_name, `Table name for ${JSON.stringify(c)} not found`)
          return (
            c.queryColumn === field.name &&
            c.tablesColumnCouldBeFrom.includes(v.underlying_table_name) &&
            c.aliasFor === v.table_column_name
          )
        }),
    )

    const res = relatedResults.length === 1 ? relatedResults[0] : undefined

    // determine nullability
    let nullability: AnalysedQueryField['nullability'] = 'unknown'
    if (res?.is_underlying_nullable === 'YES') {
      nullability = 'nullable'
    } else if (res?.hasNullableJoin) {
      nullability = 'nullable_via_join'
      // TODO: we're converting from sql to ast back and forth for `isNonNullableField`. this is probably unneded
    } else if (res?.is_underlying_nullable === 'NO' || isNonNullableField(astToViewFriendlySql(viewableAst), field)) {
      nullability = 'not_null'
    } else {
      nullability = 'unknown'
    }

    return {
      ...field,
      nullability,
      column: res && {
        schema: res.schema_name!,
        table: res.underlying_table_name!,
        name: res.table_column_name!,
      },
      comment: res?.comment || undefined,
    }
  }
}

/**
 * Generate short hash
 */
const shortHexHash = (str: string) => createHash('md5').update(str).digest('hex').slice(0, 6)
/**
 * Uses various strategies to come up with options for tags
 */
const generateTagOptions = (query: DescribedQuery) => {
  const sqlTags = tryOrDefault(() => getSuggestedTags(query.template), [])

  const codeContextTags = query.context
    .slice()
    .reverse()
    .map(item =>
      lodash
        .kebabCase(item)
        .split('-')
        .map(singular)
        .filter(part => !['query', 'result'].includes(part))
        .join('-'),
    )
    .map(lodash.flow(lodash.camelCase, lodash.upperFirst))
    .map((_, i, arr) => arr.slice(0, i + 1).join('_'))
    .filter(Boolean)

  const fieldTags = suggestedTags({
    tables: [],
    columns: query.fields.map(f => f.name),
  })

  const anonymousTags = ['Anonymous' + shortHexHash(query.sql)] // add hash to avoid `Anonymous` clashes

  return {sqlTags, codeContextTags, fieldTags, anonymousTags}
}

/**
 * Generates a list of tag options based on a query
 * @param query DescribedQuery
 * @returns List of tag options sorted by quality
 */
const generateTags = (query: DescribedQuery) => {
  const options = generateTagOptions(query)

  const tags = [...options.sqlTags]
  tags.splice(tags[0]?.slice(1).includes('_') ? 0 : 1, 0, ...options.codeContextTags)
  tags.push(...options.fieldTags)
  tags.push(...options.codeContextTags)
  tags.push(...options.anonymousTags)

  return tags
}

/**
 * Create a fallback, in case we fail to analyse the query
 */
const getDefaultAnalysedQuery = (query: DescribedQuery): AnalysedQuery => ({
  ...query,
  suggestedTags: generateTags(query),
  fields: query.fields.map(f => ({
    ...f,
    nullability: 'unknown',
    comment: undefined,
    column: undefined,
  })),
})

const nonNullableExpressionTypes = new Set([
  'integer',
  'numeric',
  'string',
  'boolean',
  'list',
  'array',
  'keyword',
  'parameter',
  'constant',
  'value',
  'values',
])
export const isNonNullableField = (sql: string, field: QueryField) => {
  const ast = getHopefullyViewableAST(sql)
  if (ast.type !== 'select' || !Array.isArray(ast.columns)) {
    return false
  }
  const nonNullableColumns = ast.columns.filter(c => {
    if (c.expr.type !== 'call') {
      return false
    }
    const name = c.alias?.name ?? c.expr.function.name
    if (field.name !== name) {
      return false
    }
    if (c.expr.function.name === 'count') {
      // `count` is the only aggregation function, which never returns null.
      return true
    }
    if (c.expr.function.name === 'coalesce') {
      // let's try to check the args for nullability - as soon as we encounter a definitive non-nullable one, the whole term becomes non-nullable.
      return c.expr.args.some(arg => {
        // for now we'll only check for static args, of which we're sure to be not null, and assume nullability for all others
        // to work for other types (i.e. refs or functions) this function needs to become recursive, which requires the change below
        // todo: centralise nullability checks in query parse routine
        const type = arg.type === 'cast' ? arg.operand.type : arg.type
        return nonNullableExpressionTypes.has(type)
      })
    }
    return false
  })
  // if there's exactly one column with the same name as the field and matching the conditions above, we can be confident it's not nullable.
  return nonNullableColumns.length === 1
}
