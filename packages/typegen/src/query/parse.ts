import * as assert from 'assert'
import * as lodash from 'lodash'
import * as neverthrow from 'neverthrow'
import * as pgsqlAST from 'pgsql-ast-parser'
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

export const safeParse = neverthrow.fromThrowable(pgsqlAST.parse, err => new Error(`Failed to parse SQL`, {cause: err}))

/**
 * _Tries_ to return `true` when a query is definitely not going to work with \gdesc. Will miss some cases, and those cases will cause an error to be logged to the console.
 * It will catch:
 * - multi statements (that pgsql-ast-parser is able to process) e.g. `insert into foo(id) values (1); insert into foo(id) values (2);`
 * - statements that use identifiers (as opposed to param values) e.g. `select * from ${sql.identifier([tableFromVariableName])}`
 */
export const getTypeability = (template: string[]): neverthrow.Result<true, Error> => {
  const delimiter = `t${Math.random()}`.replace('0.', '')
  const safeWalk = neverthrow.fromThrowable(
    () => {
      const problems: string[] = []
      const visitor = pgsqlAST.astVisitor(map => ({
        tableRef(t) {
          if (t.name === delimiter) problems.push('delimiter is used as identifier')
          map.super().tableRef(t)
        },
      }))
      visitor.statement(getASTModifiedToSingleSelect(template.join(delimiter)).ast)
      return problems
    },
    err => new Error(`Walking AST failed`, {cause: err}),
  )
  return safeWalk()
    .andThen(problems =>
      problems.length === 0
        ? neverthrow.ok(true as const)
        : neverthrow.err(new Error('Problems found:\n' + problems.join('\n'), {cause: template})),
    )
    .andThen(() => safeParse(templateToValidSql(template)))
    .andThen(statements => {
      return statements.length === 1
        ? neverthrow.ok(true as const)
        : neverthrow.err(new Error('Too many statements', {cause: template}))
    })
    .andThen(ok => {
      const containsSemicolon = templateToValidSql(template)
        .trim()
        .replaceAll('\n', ' ')
        .replace(/;$/, '')
        .includes(';')
      return containsSemicolon ? neverthrow.err(new Error('Contains semicolon', {cause: template})) : neverthrow.ok(ok)
    })
}

// todo: return null if statement is not a select
// and have test cases for when a view can't be created
/** parses a sql string and returns an AST which we've tried to modify to make it a nice easy to digest SELECT statement */
export const getASTModifiedToSingleSelect = (sql: string): ModifiedAST => {
  const statements = pgsqlAST.parse(sql)
  assert.ok(
    statements.length === 1,
    `Can't parse query\n---\n${sql}\n---\nbecause it has ${statements.length} statements.`,
  )
  return astToSelect({modifications: [], ast: statements[0], originalSql: sql})
}

export const isParseable = (sql: string): boolean => {
  try {
    pgsqlAST.parse(sql)
    return true
  } catch {
    return false
  }
}

export interface ModifiedAST {
  modifications: Array<'cte' | 'returning'>
  ast: pgsqlAST.Statement
  originalSql: string
}

export const astToSelect = ({modifications, ast, originalSql}: ModifiedAST): ModifiedAST => {
  if ((ast.type === 'update' || ast.type === 'insert' || ast.type === 'delete') && ast.returning) {
    return {
      modifications: [...modifications, 'returning'],
      originalSql,
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
      originalSql,
    })
  }

  return {modifications, ast, originalSql}
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
        ?.map(f => {
          if ('alias' in f && typeof f.alias === 'object') return f.alias.name
          if (f.type === 'table') return f.name.name
          return ''
        })
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
  if (ex.type === 'ref') {
    return ex.name
  } else if (ex.type === 'call' && ex.function.name) {
    return ex.function.name
  } else if (ex.type === 'cast') {
    return expressionName(ex.operand)
  }

  return undefined
}

export interface AliasInfo {
  /**
   * The column name in the query,
   * - e.g. in `select a as x from foo` this would be x
   * - e.g. in `select a from foo` this would be a
   */
  queryColumn: string
  /**
   * The column name in the query,
   * - e.g. in `select a as x from foo` this would be `a`
   */
  aliasFor: string | null
  /**
   * The table name(s) the column could be from,
   * - e.g. in `select a from foo` this would be foo
   * - e.g. in `select a from foo join bar on foo.id = bar.id` this would be foo and bar
   */
  tablesColumnCouldBeFrom: string[]
  /**
   * Whether the column could be nullable via a join,
   * - e.g. in `select a from foo` this would be false
   * - e.g. in `select a from foo left join bar on foo.id = bar.id` this would be true
   */
  hasNullableJoin: boolean
}
/**
 * This analyses an AST statement, and tries to find the table name and column name the query column could possibly correspond to.
 * It doesn't try to understand every possible kind of postgres statement, so for very complicated queries it will return a long
 * list of `tablesColumnCouldBeFrom`. For simple queries like `select id from messages` it'll get sensible results, though, and those
 * results can be used to look for non-nullability of columns.
 */
export const getAliasInfo = (statement: pgsqlAST.Statement): AliasInfo[] => {
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
      tableRef: t => {
        allTableReferences.push({
          table: t.name,
          referredToAs: t.alias || t.name,
        })
      },
      join(t) {
        if (t.type === 'LEFT JOIN' && t.on && t.on.type === 'binary') {
          markNullable(t.on.right)
        }

        if (t.type === 'RIGHT JOIN' && t.on && t.on.type === 'binary') {
          markNullable(t.on.left)
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

  return statement.columns.reduce<AliasInfo[]>((mappings, {expr, alias}) => {
    if (expr.type === 'ref') {
      const matchingTables = availableTables.filter(t => expr.table?.name === t.referredToAs).map(t => t.table)
      return mappings.concat({
        queryColumn: alias?.name ?? expr.name,
        aliasFor: expr.name,
        tablesColumnCouldBeFrom:
          matchingTables.length === 0 && availableTables.length === 1 ? [availableTables[0].table] : matchingTables,
        hasNullableJoin: undefined !== expr.table && nullableJoins.includes(expr.table.name),
      })
    }

    if (expr.type === 'call') {
      return mappings.concat({
        queryColumn: alias?.name ?? expr.function.name,
        aliasFor: null,
        tablesColumnCouldBeFrom: [],
        hasNullableJoin: false,
      } satisfies AliasInfo)
    }

    // console.dir({expr}, {depth: null})

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

export const getAliasMappings = lodash.flow(getASTModifiedToSingleSelect, m => m.ast, getAliasInfo)

export const removeSimpleComments = (sql: string) =>
  sql
    .split('\n')
    .map(line => (line.trim().startsWith('--') ? '' : line))
    .join('\n')
