import {Client, sql, Transactable} from '@pgkit/client'
import * as assert from 'assert'
import {createHash} from 'crypto'

import * as lodash from 'lodash'
import {Expr, Statement, toSql, parse, WithStatement} from 'pgsql-ast-parser'
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
  getTypeability,
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
      const fields = await analyzeAST(query, pool, parse(originalSql)[0], regTypeToTypeScript)
      if (fields.length === 0) {
        return {
          ...query,
          fields: query.fields.map(f => {
            return getFieldAnalysis([], modifiedAST.ast, f, originalSql)
          }),
          suggestedTags: generateTags(query),
        }
      }
      return {
        ...query,
        fields,
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
  const originalSql = toSql.statement(ast)
  if (ast.type === 'select' && ast.columns) {
    const columns = ast.columns
    const subqueryColumns = new Map(
      columns.flatMap((c, i) => {
        if (c.expr.type !== 'select') return []
        if (!c.alias?.name) return [] // todo: log a warning that adding an alias is recommended for better types
        const name = `subquery_${i}_for_column_${c.alias.name}`
        return [[i, {index: i, c, expr: c.expr, name, alias: c.alias.name}] as const]
      }),
    )
    if (subqueryColumns.size > 0) {
      const subqueryColumnValues = Array.from(subqueryColumns.values())
      const x: WithStatement = {
        type: 'with',
        bind: subqueryColumnValues.map((column): WithStatement['bind'][number] => ({
          alias: {name: column.name},
          statement: {
            ...column.expr,
            columns: column.expr.columns?.map(c => ({
              ...c,
              alias: {name: column.alias},
            })),
          },
        })),
        in: {
          ...ast,
          columns: ast.columns.map((c, i) => {
            const subqueryCol = subqueryColumns.get(i)
            if (!subqueryCol) return c
            return {
              expr: {
                type: 'ref',
                table: {name: subqueryCol.name},
                name: subqueryCol.alias,
              },
            }
          }),
          from: [
            ...(ast.from || []),
            ...subqueryColumnValues.map(({name}): NonNullable<typeof ast.from>[number] => {
              return {type: 'table', name: {name}}
            }),
          ],
        },
      }

      return analyzeAST(describedQuery, transactable, x, regTypeToTypeScript)
    }
  }

  if (ast.type === 'update' || ast.type === 'insert' || ast.type === 'delete') {
    if (!ast.returning) {
      return []
    }
    const selectifiedAst: Statement = {
      type: 'select',
      from: [
        {
          type: 'table',
          name: {
            name: ast.type === 'update' ? ast.table.name : ast.type === 'insert' ? ast.into.name : ast.from.name,
          },
        },
      ],
      columns: ast.returning,
    }
    return analyzeAST(describedQuery, transactable, selectifiedAst, regTypeToTypeScript)
  }

  const astSql = toSql.statement(ast.type === 'select' ? {...ast, where: undefined} : ast)
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
      // it's a cte
      for (const {statement, alias: tableAlias} of ast.bind) {
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

    if (ast.type === 'select' && ast.from) {
      const swappableFunctionIndexes = ast.from.flatMap((f, i) => (f.type === 'call' && f.function ? [i] : []))
      const swappedAst = {...ast, from: ast.from.slice()}
      for (const i of swappableFunctionIndexes) {
        const f = ast.from[i]
        if (f.type !== 'call') throw new Error(`Expected a call, got ${JSON.stringify(f)}`)
        const tableReplacement: (typeof ast.from)[number] = {
          type: 'table',
          name: f.alias ? {name: f.function.name, alias: f.alias.name} : f.function,
        }
        swappedAst.from[i] = tableReplacement
        const functionDefinitions = await tx.any(sql<{prosrc: string; proargnames?: string[]; proargmodes?: string[]}>`
          select prosrc, proargnames, proargmodes::text[]
          from pg_proc
          join pg_language on pg_language.oid = pg_proc.prolang
          where pg_language.lanname = 'sql'
          and proname = ${f.function.name}
          limit 2
        `)
        const functionDefinition = functionDefinitions.length === 1 ? functionDefinitions[0] : null
        if (!functionDefinition?.prosrc) {
          // maybe not a sql function, or an overloaded one, we don't handle this for now. Some types may be nullable as a result.
          continue
        }

        let underlyingFunctionDefinition = functionDefinition.prosrc

        for (const [index, argname] of (functionDefinition.proargnames || []).entries()) {
          const argmode = functionDefinition.proargmodes?.[index]
          // maybe: we should allow argmode to be undefined here, functions that return primitives seem to have no proargmodes value
          if (functionDefinition.proargmodes && argmode !== 'i' && argmode !== 'b' && argmode !== 'v') {
            // from pg docs: https://www.postgresql.org/docs/current/catalog-pg-proc.html
            // If all the arguments are IN arguments, this field will be null
            continue
          }
          const regexp = new RegExp(/\bargname\b/.source.replace('argname', argname), 'g')
          underlyingFunctionDefinition = underlyingFunctionDefinition.replaceAll(regexp, `null`)
        }
        const statement = parse(underlyingFunctionDefinition)[0]
        const analyzed = await analyzeAST({fields: []}, tx, statement, regTypeToTypeScript)

        if (analyzed.length > 0) {
          await insertTempTable(tx, {
            tableAlias: f.function.name,
            fields: analyzed,
            schemaName,
            source: 'function',
          })
        }
      }
      if (swappableFunctionIndexes.length > 0) {
        return analyzeAST({fields: []}, tx, swappedAst, regTypeToTypeScript)
      }
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
    // but use getTypeability to make sure it's parseable, sometimes pgsql-ast-parser doesn't like the format of the query
    // in those cases we'll just use the original ast - if we got this far, *some* form of the query is parseable. see locking.test.ts for an example of why we need this.
    const formattedQueryAst =
      results?.[0]?.formatted_query && getTypeability([results[0].formatted_query]).isOk()
        ? parse(results[0].formatted_query)?.[0]
        : ast
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

    const viewsWeNeedToAnalyzeFirst = new Map(
      results.flatMap(r => {
        const analyzeableView = r.underlying_table_type === 'VIEW' && r.underlying_view_definition
        return analyzeableView && r.underlying_table_name ? [[r.underlying_table_name, r] as const] : []
      }),
    )

    if (viewsWeNeedToAnalyzeFirst.size > 0) {
      for (const [viewName, result] of viewsWeNeedToAnalyzeFirst) {
        if (!result.underlying_view_definition) {
          throw new Error(
            `View ${viewName} has no underlying view definition: ${JSON.stringify({viewName, result}, null, 2)}`,
          )
        }
        const [statement, ...rest] = parse(result.underlying_view_definition)
        // if (selectStatementSql === toSql.statement(statement.ast)) {
        //   throw new Error(
        //     `Circular view dependency detected: ${selectStatementSql} depends on ${result.underlying_view_definition}`,
        //   )
        // }
        if (statement?.type !== 'select') {
          throw new Error(`Expected a select statement, got ${statement?.type}`)
        }
        if (rest.length > 0) {
          throw new Error(`Expected a single select statement, got ${result.underlying_view_definition}`)
        }
        const analyzed = await analyzeAST({fields: []}, tx, statement, regTypeToTypeScript)
        // await insertPrerequisites(tx, schemaName, analyzed, statement.ast, {
        //   tableAlias: viewName,
        //   source: 'view',
        // })
        await insertTempTable(tx, {
          tableAlias: viewName,
          fields: analyzed,
          schemaName,
          source: 'view',
        })
      }
      // get results again - we have now inserted the view's dependencies as temp tables, so we should get fuller results
      results = SelectStatementAnalyzedColumnSchema.array().parse(
        await tx.any(AnalyzeSelectStatementColumnsQuery(astSql)),
      )
    }

    const analyzed = await Promise.all(
      aliasInfoList.map(async aliasInfo => {
        const matchingQueryField = describedQuery.fields.find(f => f.name === aliasInfo.queryColumn)

        const matchingResult = results.find(
          r =>
            r.table_column_name === aliasInfo.aliasFor &&
            JSON.stringify([r.underlying_table_name]) === JSON.stringify(aliasInfo.tablesColumnCouldBeFrom),
        )

        if (!matchingResult && formattedQueryAst.type === 'select') {
          const columnNames = formattedQueryAst.columns?.map(({alias, expr}, i) => {
            let name =
              alias?.name || (expr.type === 'ref' ? expr.name : expr.type === 'call' ? expr.function.name : null)
            if (name === null || name === '*') {
              name = `column_${i}`
            }
            return {
              name,
            }
          })

          /** Create a new AST looking like
           *
           * ```sql
           * with temp_view as (
           *   select foo, bar from your_table
           *   where false
           * )
           * select pg_typeof(temp_view.foo) as foo
           * from temp_view
           * right join (select true) as t on true
           * ```
           *
           * This returns the regtype of the column, and the where false makes sure no results are actually returned. The right join with `true` makes sure we actually get a result.
           */
          const pgTypeOfAst: Statement = {
            type: 'with',
            bind: [
              {
                alias: {name: 'temp_view'},
                statement: {
                  ...formattedQueryAst,
                  columns: formattedQueryAst.columns?.map((c, i) => ({
                    ...c,
                    alias: columnNames![i],
                  })),
                  where: {
                    type: 'boolean',
                    value: false,
                  },
                },
              },
            ],
            in: {
              type: 'select',

              columns: formattedQueryAst.columns?.map((c, i) => ({
                expr: {
                  type: 'call',
                  function: {name: 'pg_typeof'},
                  args: [
                    {
                      type: 'ref',
                      table: {name: 'temp_view'},
                      name: columnNames![i].name,
                    },
                  ],
                },
                alias: {name: `${columnNames![i].name}`},
              })),

              from: [
                {
                  type: 'table',
                  name: {name: 'temp_view'},
                },
                {
                  type: 'statement',
                  alias: 't',
                  statement: {
                    type: 'select',
                    columns: [{expr: {type: 'boolean', value: true}}],
                  },
                  join: {type: 'RIGHT JOIN', on: {type: 'boolean', value: true}},
                },
              ],
            },
          }
          const pgTypeOfResult = await tx
            .maybeOne<Record<string, string>>(sql.raw(toSql.statement(pgTypeOfAst)))
            .catch(e => {
              console.warn(`Error getting regtype for ${aliasInfo.queryColumn}`, e)
              return undefined
            })

          const regtype = pgTypeOfResult?.[aliasInfo.queryColumn]
          if (regtype) {
            return getFieldAnalysis(
              results,
              ast,
              {
                name: aliasInfo.queryColumn,
                regtype: regtype,
                typescript: regTypeToTypeScript(regtype),
              },
              originalSql,
            )
          }
        }

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
              formattedQuery: toSql.statement(formattedQueryAst),
            },
            {depth: null},
          )
          return []
        }

        const dataType = matchingResult.formatted_data_type || matchingResult.underlying_data_type!
        if (dataType === 'USER-DEFINED') {
          console.warn(`Skipping USER-DEFINED type ${aliasInfo.queryColumn}`, {matchingResult})
          return []
        }
        return [
          getFieldAnalysis(
            results,
            ast,
            {
              name: aliasInfo.queryColumn,
              regtype: dataType,
              typescript:
                dataType === 'USER-DEFINED'
                  ? // @ts-expect-error
                    // todo: avoid needing to do this? problem in ambiguoust-tables.test.ts
                    console.log({matchingResult}) ||
                    describedQuery.fields.find(f => f.name === aliasInfo.queryColumn)?.typescript ||
                    'unknown'
                  : regTypeToTypeScript(dataType),
            },
            originalSql, // was formerly astSql
          ),
        ]
      }),
    )

    return analyzed.flat()
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
  inputAst: Statement,
  field: QueryField,
  originalSql: string,
): AnalysedQueryField => {
  if (field.regtype === 'ARRAY') console.dir({field, originalSql, stack: new Error().stack}, {depth: null})
  /** formatted_query is generated by the magic of pg and something about it is different somehow */
  const formattedQuery = selectStatementColumns[0]?.formatted_query
  const ast =
    formattedQuery && isParseable(formattedQuery)
      ? parse(formattedQuery)[0] // not totally sure why formattedQuery is better than originalAst here but lots fails when we don't do this
      : inputAst // this can happen for `select count(*) from foo` type queries I think

  if (ast === inputAst && originalSql) {
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
        // assert.ok(v.underlying_table_name, `Table name for ${JSON.stringify(c)} not found`)
        return (
          v.underlying_table_name &&
          c.queryColumn === field.name &&
          c.tablesColumnCouldBeFrom.includes(v.underlying_table_name) &&
          c.aliasFor === v.table_column_name
        )
      }),
  )

  const res = relatedResults.length === 1 ? relatedResults[0] : undefined

  // determine nullability
  let nullability: AnalysedQueryField['nullability'] = 'unknown'
  if (isNonNullableField(originalSql, field)) {
    nullability = 'not_null'
  } else if (res?.is_underlying_nullable === 'YES') {
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

export const isNonNullableField = (statementSql: string, field: QueryField) => {
  // todo: figure out if we can help this function out by:
  // 1. having it receive an AST rather than SQL
  // 2. when passing it the AST, add helpful "where" clauses that say things like `where a is not null` - we are calling this after we've done most of the hard work of figuring out what columns not null already
  // 3. let it check where clauses for nullability - if a value is checked as not null, we can be sure it's not null
  const {ast} = getASTModifiedToSingleSelect(statementSql)
  if (ast.type !== 'select' || !Array.isArray(ast.columns)) {
    return false
  }

  const nonNullableColumns = ast.columns.filter(c => {
    return isNonNullableExpression(c.expr)

    function isNonNullableExpression(expression: Expr): boolean {
      if (ast.type === 'select' && ast.where && whereExpressionMakesFieldNonNullable(field, ast.where)) {
        return true
      }

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

const whereExpressionMakesFieldNonNullable = (field: QueryField, e: Expr): boolean => {
  if (e.type === 'unary' && e.op === 'IS NOT NULL' && isRefToCurrentField(field, e.operand)) {
    return true
  }

  if (
    e.type === 'binary' &&
    (e.op === '>' || e.op === '<' || e.op === '>=' || e.op === '<=') &&
    (isRefToCurrentField(field, e.left) || isRefToCurrentField(field, e.right))
  ) {
    return true
  }

  if (e.type === 'binary' && e.op === 'AND') {
    return whereExpressionMakesFieldNonNullable(field, e.left) || whereExpressionMakesFieldNonNullable(field, e.right)
  }

  if (e.type === 'binary' && e.op === 'OR') {
    return whereExpressionMakesFieldNonNullable(field, e.left) && whereExpressionMakesFieldNonNullable(field, e.right)
  }

  return false
}

const isRefToCurrentField = (field: QueryField, e: Expr): boolean => {
  return e.type === 'ref' && e.name === field.name
}
