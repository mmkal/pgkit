import {Client, sql, Transactable} from '@pgkit/client'
import * as assert from 'assert'
import {createHash} from 'crypto'

import * as lodash from 'lodash'
import {Expr, Statement, toSql, parse} from 'pgsql-ast-parser'
import {singular} from 'pluralize'

import {AnalysedQuery, AnalysedQueryField, DescribedQuery, QueryField} from '../types'
import {tryOrDefault} from '../util'
import {memoizeQueryFn} from '../utils/memoize'
import {
  SelectStatementAnalyzedColumn,
  SelectStatementAnalyzedColumnSchema,
  analyzeSelectStatement,
  createAnalyzeSelectStatementColumnsFunction,
} from './analyze-select-statement'
import {
  getAliasInfo,
  getASTModifiedToSingleSelect,
  getSuggestedTags,
  isParseable,
  suggestedTags,
  templateToValidSql,
} from './parse'

type RegTypeToTypeScript = (formattedRegType: string & {brand?: 'formatted regtype'}) => string & {brand?: 'typescript'}

// todo: logging
// todo: get table description from obj_description(oid) (like column)

export const getColumnInfo = memoizeQueryFn(
  async (pool: Client, query: DescribedQuery, regTypeToTypeScript: RegTypeToTypeScript): Promise<AnalysedQuery> => {
    const originalSql = templateToValidSql(query.template)
    const modifiedAST = getASTModifiedToSingleSelect(originalSql)

    if (process.env.NEW_AST_ANALYSIS) {
      return {
        ...query,
        fields: await analyzeAST(query, pool, parse(originalSql)[0], regTypeToTypeScript),
        suggestedTags: generateTags(query),
      }
    }

    if (modifiedAST.ast.type !== 'select') {
      return getDefaultAnalysedQuery(query)
    }

    const singleSelectAst = modifiedAST.ast
    const analyzedSelectStatement = await analyzeSelectStatement(pool, modifiedAST)
    const filteredStatements = analyzedSelectStatement.filter(c => !c.error_message)

    return {
      ...query,
      suggestedTags: generateTags(query),
      fields: query.fields.map(field => getFieldAnalysis(filteredStatements, singleSelectAst, field, originalSql)),
    }
  },
)

export const analyzeAST = async (
  describedQuery: Pick<DescribedQuery, 'fields'>,
  transactable: Transactable,
  ast: Statement,
  regTypeToTypeScript: RegTypeToTypeScript,
): Promise<AnalysedQueryField[]> => {
  const astSql = toSql.statement(ast)
  const schemaName =
    'pgkit_typegen_temp_schema_' + createHash('md5').update(JSON.stringify(ast)).digest('hex').slice(0, 6)
  const schemaIdentifier = sql.identifier([schemaName])
  const oldSearchPath = await transactable.oneFirst<{search_path: string}>(sql`show search_path`)
  const newSearchPath = `${schemaName}, ${oldSearchPath}`

  const columnAnalysis = await transactable.transaction(async tx => {
    await tx.query(sql`create schema if not exists ${schemaIdentifier}`)
    await tx.query(sql.raw(`set search_path to ${newSearchPath}`))
    await createAnalyzeSelectStatementColumnsFunction(tx, schemaName)

    if (ast.type === 'with') {
      for (const {statement, alias: tableAlias} of ast.bind) {
        // const modifiedAst = getASTModifiedToSingleSelect(toSql.statement(statement))
        const analyzed = await analyzeAST(
          {fields: []}, // no benefit of \gdesc info here because this is a subquery
          tx,
          statement,
          regTypeToTypeScript,
        )

        await insertTempTable(tx, {
          tableAlias: tableAlias.name,
          fields: analyzed,
          schemaName,
          source: 'CTE subquery',
        })
      }

      return analyzeAST(describedQuery, tx, ast.in, regTypeToTypeScript)
    }

    const AnalyzeSelectStatementColumnsQuery = (statmentSql: string) => sql`
      --typegen-ignore
      select * from ${sql.identifier([schemaName, 'analyze_select_statement_columns'])}(${statmentSql})
    `
    // todo: figure out why sql.type(MyZodType) isn't working here
    let results = SelectStatementAnalyzedColumnSchema.array().parse(
      await tx.any(AnalyzeSelectStatementColumnsQuery(astSql)),
    )

    results = lodash.uniqBy<SelectStatementAnalyzedColumn>(results, JSON.stringify)

    // it's better to use formatted_query even though it means re-parsing, because it's been processed by pg and all the inferred table sources are made explicit
    const formattedQueryAst = results?.[0]?.formatted_query ? parse(results?.[0].formatted_query)?.[0] : ast
    const aliasInfoList = getAliasInfo(formattedQueryAst)

    for (const r of results) {
      if (r.error_message) {
        // todo: start warning users.
        // or, maybe, make it logger.debug and show these with the `--debug` flag
        // and/or have a `--strict` flag that errors when there are any warnings - making this a kind of sql validator tool which is cool
        // eslint-disable-next-line unicorn/no-lonely-if
        if (process.env.NODE_ENV === 'test') {
          // eslint-disable-next-line no-console
          console.warn(`wError analyzing select statement: ${r.error_message}`)
        }
      }
    }

    return aliasInfoList.flatMap(aliasInfo => {
      const matchingQueryField = describedQuery.fields.find(f => f.name === aliasInfo.queryColumn)

      const matchingResult = results.find(
        r =>
          r.table_column_name === aliasInfo.aliasFor &&
          JSON.stringify([r.underlying_table_name]) === JSON.stringify(aliasInfo.tablesColumnCouldBeFrom),
      )

      if (matchingQueryField && !matchingResult) {
        // todo: see if we can do better than this. this is just falling back the output of `psql \gdesc`
        // todo: watch out, we are matching the overall `describedQuery.fields` here, not necessarily this random CTE expression. there could be re-use of names and this would be wrong.
        // todo: watch out also for `select count((a, b)) from foo`. that would be a view_column_usage and the data type would imply the wrong type
        // for postgres 16+ we could use a pg_prepared_statement.result_types
        return [
          {
            column: undefined,
            name: aliasInfo.queryColumn,
            regtype: matchingQueryField.regtype,
            typescript: matchingQueryField.typescript,
            nullability: 'unknown',
            comment: undefined,
          } satisfies AnalysedQueryField,
        ]
      }

      if (!matchingResult) {
        console.dir(
          {
            msg: 'no matchingResult',
            describedQuery,
            aliasInfo,
            results,
            formattedQuery: results?.[0]?.formatted_query,
          },
          {depth: null},
        )
        return []
        // todo: delete throw. there will always be times we don't get results from view_column_usage like count(1)
        throw new Error(`Alias info not found for ${JSON.stringify(aliasInfo)}`)
      }

      return [
        getFieldAnalysis(
          results,
          ast,
          {
            name: aliasInfo.queryColumn,
            regtype: matchingResult.underlying_data_type!,
            typescript: regTypeToTypeScript(matchingResult.formatted_data_type!),
          },
          astSql,
        ),
      ]
    })
  })

  return columnAnalysis
}

const insertTempTable = async (
  tx: Transactable,
  params: {
    tableAlias: string
    source: string
    schemaName: string
    fields: AnalysedQueryField[]
  },
) => {
  const {schemaName, fields} = params
  const tableAlias = {name: params.tableAlias}

  // if (statement.type !== 'select') throw new Error(`Expected a select statement, got ${statement.type}`)
  const tempTableColumns = fields.flatMap(field => {
    const aliasName = field.name

    const def = `${aliasName} ${field.regtype} ${field.nullability === 'not_null' || field.nullability === 'assumed_not_null' ? 'not null' : ''}`

    const comment = [
      `From ${params.source} "${tableAlias.name}"`,
      field.column && `column source: ${field.column?.schema}.${field.column?.table}.${field.column?.name}`,
    ]

    return {
      name: aliasName,
      def,
      comment: comment.filter(Boolean).join(', '),
    }
  })

  const raw = sql.raw(`
    drop table if exists ${schemaName}.${tableAlias.name};
    create table ${schemaName}.${tableAlias.name}(
      ${tempTableColumns.map(c => c.def).join(',\n')}
    );

    ${tempTableColumns
      .map(c => {
        return `comment on column ${schemaName}.${tableAlias.name}.${c.name} is '${c.comment}';`
      })
      .join('\n')}
  `)
  if (fields.length === 0) {
    console.warn('not inserting empty table', raw, fields, params)
  } else {
    await tx.query(raw)
  }
}

const getFieldAnalysis = (
  selectStatementColumns: SelectStatementAnalyzedColumn[],
  originalAst: Statement,
  field: QueryField,
  originalSql: string,
): AnalysedQueryField => {
  /** formatted_query is generated by the magic of pg and something about it is different somehow */
  const formattedQuery = selectStatementColumns[0]?.formatted_query
  const ast =
    formattedQuery && isParseable(formattedQuery)
      ? getASTModifiedToSingleSelect(formattedQuery).ast // not totally sure why formattedQuery is better than originalAst here but lots fails when we don't do this
      : originalAst // this can happen for `select count(*) from foo` type queries I think

  if (ast === originalAst && originalSql) {
    // console.warn('using originalAst', {formattedQuery, originalSql})
  }

  const aliasInfo = getAliasInfo(ast)

  const relatedResults = aliasInfo.flatMap(c =>
    selectStatementColumns
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
  } else if (res?.is_underlying_nullable === 'NO' || isNonNullableField(toSql.statement(ast), field)) {
    nullability = 'not_null'
  } else {
    nullability = 'unknown'
  }

  return {
    ...field,
    nullability,
    column:
      res?.schema_name && res.underlying_table_name && res.table_column_name
        ? {
            schema: res.schema_name,
            table: res.underlying_table_name,
            name: res.table_column_name,
          }
        : undefined,
    comment: res?.comment || undefined,
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
  tags.push(...options.fieldTags, ...options.codeContextTags, ...options.anonymousTags)

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

const nonNullableAggregationFunctions = new Set([
  'count',
  'exists', //
])

const nonNullableKeywords = new Set([
  'current_date', //
  'current_timestamp',
  'current_time',
])

export const isNonNullableField = (sql: string, field: QueryField) => {
  // todo: figure out if we can help this function out by:
  // 1. having it receive an AST rather than SQL
  // 2. when passing it the AST, add helpful "where" clauses that say things like `where a is not null` - we are calling this after we've done most of the hard work of figuring out what columns not null already
  // 3. let it check where clauses for nullability - if a value is checked as not null, we can be sure it's not null
  const {ast} = getASTModifiedToSingleSelect(sql)
  if (ast.type !== 'select' || !Array.isArray(ast.columns)) {
    return false
  }

  const nonNullableColumns = ast.columns.filter(c => {
    return isNonNullableExpression(c.expr)

    function isNonNullableExpression(expression: Expr): boolean {
      if (nonNullableExpressionTypes.has(expression.type)) {
        return true
      }

      if (expression.type === 'keyword') {
        return nonNullableKeywords.has(expression.keyword)
      }

      if (expression.type === 'binary') {
        return isNonNullableExpression(expression.left) && isNonNullableExpression(expression.right)
      }

      if (expression.type === 'call') {
        const name = c.alias?.name ?? expression.function.name
        if (field.name !== name) {
          return false
        }

        if (nonNullableAggregationFunctions.has(expression.function.name)) {
          return true
        }

        if (expression.function.name === 'coalesce') {
          // let's try to check the args for nullability - as soon as we encounter a definitive non-nullable one, the whole term becomes non-nullable.
          return expression.args.some(arg => {
            // for now we'll only check for static args, of which we're sure to be not null, and assume nullability for all others
            // to work for other types (i.e. refs or functions) this function needs to become recursive, which requires the change below
            // todo: centralise nullability checks in query parse routine
            const type = arg.type === 'cast' ? arg.operand.type : arg.type
            return nonNullableExpressionTypes.has(type)
          })
        }
      }

      return false
    }
  })

  // if there's exactly one column with the same name as the field and matching the conditions above, we can be confident it's not nullable.
  return nonNullableColumns.length === 1
}
