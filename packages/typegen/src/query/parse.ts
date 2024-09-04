import * as assert from 'assert'

import {match} from 'io-ts-extra'
import * as lodash from 'lodash'
import * as pgsqlAST from 'pgsql-ast-parser'
import {QName} from 'pgsql-ast-parser'
import * as pluralize from 'pluralize'

import {pascalCase} from '../util'

// function return types:
// $ echo 'select pg_get_function_result(2880)' | docker-compose exec -T postgres psql -h localhost -U postgres postgres -f -
// $ echo 'select oid, proname from pg_proc where proname like '"'"'%advisory%'"'"' limit 1' | docker-compose exec -T postgres psql -h localhost -U postgres postgres -f -

/**
 * parser needs valid-ish sql, so can't use $1, $2 placeholders. Use `null` as a placeholder instead.
 * Will probably still fail when placeholder is used for a table identifier, but we can't get any types
 * at all for those kinds of queries anyway.
 */
export const templateToValidSql = (template: string[]) => template.join('null')

/**
 * _Tries_ to return `true` when a query is definitely not going to work with \gdesc. Will miss some cases, and those cases will cause an error to be logged to the console.
 * It will catch:
 * - multi statements (that pgsql-ast-parser is able to process) e.g. `insert into foo(id) values (1); insert into foo(id) values (2);`
 * - statements that use identifiers (as opposed to param values) e.g. `select * from ${sql.identifier([tableFromVariableName])}`
 */
export const isUntypeable = (template: string[]) => {
  let untypeable = false
  try {
    const delimiter = `t${Math.random()}`.replace('0.', '')
    const visitor = pgsqlAST.astVisitor(map => ({
      tableRef(t) {
        if (t.name === delimiter) {
          untypeable = true // can only get type when delimiter is used as a parameter, not an identifier
        }

        map.super().tableRef(t)
      },
    }))
    visitor.statement(getASTModifiedToSingleSelect(template.join(delimiter)).ast)
  } catch {
    // never mind?
  }

  // too many statements
  try {
    untypeable ||= pgsqlAST.parse(templateToValidSql(template)).length !== 1
  } catch {
    untypeable ||= templateToValidSql(template).trim().replaceAll('\n', ' ').replace(/;$/, '').includes(';')
  }

  return untypeable
}

// todo: return null if statement is not a select
// and have test cases for when a view can't be created
/** parses a sql string and returns an AST which we've tried to modify to make it a nice easy to digest SELECT statement */
export const getASTModifiedToSingleSelect = (sql: string): ModifiedAST => {
  const statements = parseWithWorkarounds(sql)
  assert.ok(statements.length === 1, `Can't parse query ${sql}; it has ${statements.length} statements.`)
  return astToSelect({modifications: [], ast: statements[0]})
}

export const parseWithWorkarounds = (sql: string, attemptsLeft = 2): pgsqlAST.Statement[] => {
  try {
    return pgsqlAST.parse(sql)
  } catch (e) {
    /* istanbul ignore if */
    if (attemptsLeft <= 1) {
      throw e
    }

    if (sql.trim().startsWith('with ')) {
      // handle (some) CTEs. Can fail if comments trip up the parsing. You'll end up with queries called `Anonymous` if that happens
      const state = {
        parenLevel: 0,
        cteStart: -1,
      }
      const replacements: Array<{start: number; end: number; text: string}> = []

      for (let i = 0; i < sql.length; i++) {
        const prev = sql.slice(0, i).replace(/\s+/, ' ').trim()
        if (sql[i] === '(') {
          state.parenLevel++
          if (prev.endsWith(' as') && state.parenLevel === 1) {
            state.cteStart = i
          }
        }

        if (sql[i] === ')') {
          state.parenLevel--
          if (state.parenLevel === 0 && state.cteStart > -1) {
            replacements.push({start: state.cteStart + 1, end: i, text: 'select 1'})
            state.cteStart = -1
          }
        }
      }

      const newSql = replacements.reduceRight(
        (acc, rep) => acc.slice(0, rep.start) + rep.text + acc.slice(rep.end),
        sql,
      )

      return parseWithWorkarounds(newSql, attemptsLeft - 1)
    }

    throw e
  }
}

interface ModifiedAST {
  modifications: Array<'cte' | 'returning'>
  ast: pgsqlAST.Statement
}

const astToSelect = ({modifications, ast}: ModifiedAST): ModifiedAST => {
  if ((ast.type === 'update' || ast.type === 'insert' || ast.type === 'delete') && ast.returning) {
    return {
      modifications: [...modifications, 'returning'],
      ast: {
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
      },
    }
  }

  if (ast.type === 'with') {
    return astToSelect({
      modifications: [...modifications, 'cte'],
      ast: ast.in,
    })
  }

  return {modifications, ast}
}

/**
 * Get tables and columns used in a sql query. Not complete; optimistic. Useful for getting a (non-unique)
 * name that can be used to refer to queries.
 */
export const sqlTablesAndColumns = (sql: string): {tables?: string[]; columns?: string[]} => {
  const {ast} = getASTModifiedToSingleSelect(sql)

  if (ast.type === 'select') {
    return {
      tables: ast.from
        ?.map(f =>
          match(f)
            .case({alias: {name: String}}, f => f.alias.name)
            .case({type: 'table'} as const, t => t.name.name)
            .default(() => '') // filtered out below
            .get(),
        )
        .filter(Boolean),
      columns: lodash
        .chain(ast.columns)
        .map(c => c.alias?.name || expressionName(c.expr))
        .compact()
        .value(),
    }
  }

  return {}
}

const expressionName = (ex: pgsqlAST.Expr): string | undefined => {
  return match(ex)
    .case({type: 'ref' as const}, e => e.name)
    .case({type: 'call', function: {name: String}} as const, e => e.function.name)
    .case({type: 'cast'} as const, e => expressionName(e.operand))
    .default(() => undefined)
    .get()
}

export interface AliasMapping {
  queryColumn: string
  aliasFor: string
  tablesColumnCouldBeFrom: string[]
  hasNullableJoin: boolean
}
/**
 * This analyses an AST statement, and tries to find the table name and column name the query column could possibly correspond to.
 * It doesn't try to understand every possible kind of postgres statement, so for very complicated queries it will return a long
 * list of `tablesColumnCouldBeFrom`. For simple queries like `select id from messages` it'll get sensible results, though, and those
 * results can be used to look for non-nullability of columns.
 */
export const aliasMappings = (statement: pgsqlAST.Statement): AliasMapping[] => {
  assert.strictEqual(statement.type, 'select' as const)
  assert.ok(statement.columns, `Can't get alias mappings from query with no columns`)

  interface QueryTableReference {
    table: string
    referredToAs: string
  }

  const allTableReferences: QueryTableReference[] = []
  const nullableJoins: string[] = []
  const markNullable = (ref: pgsqlAST.Expr) =>
    ref.type === 'ref' && ref.table?.name && nullableJoins.push(ref.table.name)

  pgsqlAST
    .astVisitor(map => ({
      tableRef: t =>
        allTableReferences.push({
          table: t.name,
          referredToAs: t.alias || t.name,
        }),
      join(t) {
        if (t.type === 'LEFT JOIN' && t.on && t.on.type === 'binary') {
          markNullable(t.on.right)
        }

        if (t.type === 'FULL JOIN' && t.on?.type === 'binary') {
          markNullable(t.on.left)
          markNullable(t.on.right)
        }

        return map.super().join(t)
      },
    }))
    .statement(statement)

  const availableTables = lodash.uniqBy(allTableReferences, JSON.stringify)

  const aliasGroups = lodash.groupBy(availableTables, t => t.referredToAs)

  assert.ok(
    !lodash.some(aliasGroups, group => group.length > 1),
    `Some aliases are duplicated, this is too confusing. ${JSON.stringify({aliasGroups})}`,
  )

  return statement.columns.reduce<AliasMapping[]>((mappings, {expr, alias}) => {
    if (expr.type === 'ref') {
      return mappings.concat({
        queryColumn: alias?.name ?? expr.name,
        aliasFor: expr.name,
        tablesColumnCouldBeFrom: availableTables.filter(t => expr.table?.name === t.referredToAs).map(t => t.table),
        hasNullableJoin: undefined !== expr.table && nullableJoins.includes(expr.table.name),
      })
    }

    return mappings
  }, [])
}

export const suggestedTags = ({tables, columns}: ReturnType<typeof sqlTablesAndColumns>): string[] => {
  if (!columns) {
    return ['_void']
  }

  const tablesInvolved = (tables || []).map(pascalCase).map(pluralize.singular).join('_')

  return lodash
    .uniq([
      tablesInvolved, // e.g. User_Role
      [tablesInvolved, ...columns.map(lodash.camelCase)].filter(Boolean).join('_'), // e.g. User_Role_id_name_roleId
    ])
    .map(lodash.upperFirst)
    .filter(Boolean)
}

export const getSuggestedTags = lodash.flow(templateToValidSql, sqlTablesAndColumns, suggestedTags)

export const getAliasMappings = lodash.flow(getASTModifiedToSingleSelect, m => m.ast, aliasMappings)

export const removeSimpleComments = (sql: string) =>
  sql
    .split('\n')
    .map(line => (line.trim().startsWith('--') ? '' : line))
    .join('\n')
