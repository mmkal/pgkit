import * as pgsqlAST from 'pgsql-ast-parser'
import * as lodash from 'lodash'
import {pascalCase} from '../util'
import {match} from 'io-ts-extra'

// function return types:
// $ echo 'select pg_get_function_result(2880)' | docker-compose exec -T postgres psql -h localhost -U postgres postgres -f -
// $ echo 'select oid, proname from pg_proc where proname like '"'"'%advisory%'"'"' limit 1' | docker-compose exec -T postgres psql -h localhost -U postgres postgres -f -

/**
 * parser needs valid-ish sql, so can't use $1, $2 placeholders. Use `null` as a placeholder instead.
 * Will probably still fail when placeholder is used for a table identifier, but we can't get any types
 * at all for those kinds of queries anyway.
 */
export const templateToValidSql = (template: string[]) => template.join('null')

export const getHopefullyViewableAST = (sql: string): pgsqlAST.Statement => {
  const statements = pgsqlAST.parse(sql)
  if (statements.length !== 1) {
    // todo: don't throw (find out what slonik/other clients do here?)
    throw new Error(`Can't parse query ${sql}; it has ${statements.length} statements.`)
  }
  const ast = statements[0]

  if ((ast.type === 'update' || ast.type === 'insert') && ast.returning) {
    return {
      type: 'select',
      from: [
        {
          type: 'table',
          name: ast.type === 'update' ? ast.table.name : ast.into.name,
        },
      ],
      columns: ast.returning.map(r => ({
        expr: r.expr,
      })),
    }
  }

  // console.log({ast})

  return ast
}

/**
 * Get tables and columns used in a sql query. Not complete; optimistic. Useful for getting a (non-unique)
 * name that can be used to refer to queries.
 */
export const sqlTablesAndColumns = (sql: string): {tables?: string[]; columns?: string[]} => {
  //Omit<ParsedQuery, 'tag' | 'file'> => {
  if (Math.random()) {
    // return parse2(sql)
  }

  const ast = getHopefullyViewableAST(sql)

  if (ast.type === 'select') {
    return {
      tables: ast.from
        ?.map(f =>
          match(f)
            .case({type: 'table'} as const, t => t.name)
            .default(f => f.alias || '')
            .get(),
        )
        .filter(Boolean),
      columns: lodash
        .chain(ast.columns)
        .map(c => c.alias || expressionName(c.expr))
        .compact()
        .value(),
    }
  }

  return {}

  //   const cols = ast.type === 'select' ? ast.columns! : ast.type === 'insert' ? ast.returning : []
  //   const colExpressions: Array<{table?: string; name: string}> = cols!
  //     .map(c => c.expr)
  //     .map(c =>
  //       match(c)
  //         // .target<{table?: string; name: string}>()
  //         .case(
  //           // e.g. `select oid from pg_type`
  //           {type: 'ref'} as const,
  //           e => e,
  //         )
  //         .case(
  //           // e.g. `select oid::regtype from pg_type`
  //           {type: 'cast', operand: {type: 'ref'}} as const,
  //           e => e.operand,
  //         )
  //         .default(() => ({table: undefined, name: '???'}))
  //         .get(),
  //     )
  //     .map(c => ({table: c.table, name: c.name}))

  //   return {
  //     sql,
  //     suggestedTag: match(ast)
  //       .case({type: 'select'} as const, q =>
  //         (q.from || []).map(f =>
  //           match(f)
  //             .case({name: String}, fr => fr.name)
  //             .default(() => 'unknown')
  //             .get(),
  //         ),
  //       )
  //       .default(() => ['unknown'])
  //       .get()
  //       ?.join('_'),
  //     // ),
  //     columns: colExpressions.map(c => ({
  //       name: c.name,
  //       table: c.table,
  //       notNull: false,
  //     })),
  //   }
  // }

  // export const parse2 = (sql: string): any | Omit<ParsedQuery, 'tag' | 'file'> => {
  //   const surveyor = new sqlSurveyor.SQLSurveyor(sqlSurveyor.SQLDialect.PLpgSQL)
  //   const ast = surveyor.survey(sql)
  //   if (Object.keys(ast.parsedQueries).length !== 1) {
  //     // throw 'foo'
  //   }
  //   const query = ast.getQueryAtLocation(0)
  //   if (Math.random()) {
  //     // query.get
  //     return [
  //       query.outputColumns,
  //       query.referencedTables, //
  //       query.getTableFromAlias('as f'),
  //       query,
  //     ] as any
  //   }
  //   return {
  //     sql,
  //     suggestedTag: lodash
  //       .chain(query.outputColumns)
  //       .map(c => c.tableName)
  //       .uniq()
  //       .map(pascalCase)
  //       .join('_')
  //       .value(),
  //     // @ts-expect-error
  //     columns: query.outputColumns.map(c => ({
  //       table: c.tableName,
  //       name: c.columnAlias,
  //       notNull: false,
  //     })),
  //   }
}

const expressionName = (ex: pgsqlAST.Expr): string | undefined => {
  return match(ex)
    .case({type: 'ref' as const}, e => e.name)
    .case({type: 'call', function: String} as const, e => e.function)
    .case({type: 'cast'} as const, e => expressionName(e.operand))
    .default(() => undefined)
    .get()
}

/**
 * This analyses an AST statement, and tries to find the table name and column name the query column could possibly correspond to.
 * It doesn't try to understand every possible kind of postgres statement, so for very complicated queries it will return a long
 * list of `tablesColumnCouldBeFrom`. For simple queries like `select id from messages` it'll get sensible results, though, and those
 * results can be used to look for non-nullability of columns.
 */
export const aliasMappings = (
  statement: pgsqlAST.Statement,
): Array<{queryColumn: string; aliasFor: string; tablesColumnCouldBeFrom: string[]}> => {
  if (statement.type !== 'select') {
    return []
  }

  const allTableReferences: Array<{table: string; referredToAs: string}> = []
  pgsqlAST
    .astVisitor(map => ({
      tableRef: t => allTableReferences.push({table: t.name, referredToAs: t.alias || t.name}),
      join: t => map.super().join(t),
    }))
    .statement(statement)

  const availableTables = lodash.uniqBy(allTableReferences, JSON.stringify)

  if (
    lodash
      .chain(availableTables)
      .groupBy(t => t.referredToAs)
      .some(group => group.length > 1)
      .value()
  ) {
    throw new Error(`Some aliases are duplicated, this is too confusing`)
  }

  const mappings = statement.columns
    ?.map(c => ({
      queryColumn: c.alias,
      aliasFor: c.expr.type === 'ref' ? c.expr.name : '',
      tablesColumnCouldBeFrom: availableTables
        .filter(t => (c.expr.type === 'ref' && c.expr.table ? c.expr.table === t.referredToAs : true))
        .map(t => t.table),
    }))
    .map(c => ({...c, queryColumn: c.queryColumn || c.aliasFor}))
    .filter(c => c.queryColumn && c.aliasFor)

  return mappings || []
}

export const suggestedTags = ({tables, columns}: ReturnType<typeof sqlTablesAndColumns>): string[] => {
  if (!tables && !columns) {
    return ['void']
  }
  tables = tables || []
  columns = columns || []

  const tablesInvolved = tables.map(pascalCase).join('_')

  return lodash.uniq([
    tablesInvolved, // e.g. User_Role
    [tablesInvolved, ...columns.map(lodash.camelCase)].filter(Boolean).join('_'), // e.g. User_Role_id_name_roleId
  ])
}

export const getSuggestedTags = lodash.flow(templateToValidSql, sqlTablesAndColumns, suggestedTags)

export const getViewFriendlySql = lodash.flow(templateToValidSql, getHopefullyViewableAST, pgsqlAST.toSql.statement)

export const getAliasMappings = lodash.flow(getHopefullyViewableAST, aliasMappings)

if (require.main === module) {
  console.log = (x: any) => console.dir(x, {depth: null})

  // console.log(getHopefullyViewableAST('select other.content as id from messages join other on shit = id where id = 1'))
  console.log(getHopefullyViewableAST('select m.content from messages m'))
  console.log(lodash.flow(getHopefullyViewableAST, aliasMappings)('select * from messages where id = 1'))
  throw ''
  // console.dir(suggestedTags(parse('insert into foo(id) values (1) returning id, date')), {depth: null})
  // console.dir(suggestedTags(parse('insert into foo(id) values (1) returning id, date')), {depth: null})
  console.log(
    sqlTablesAndColumns('select pt.typname, foo.bar::regtype from pg_type as pt join foo on pg_type.id = foo.oid'),
  )
  // console.dir(suggestedTags(parse('select foo::regtype from foo')), {depth: null})
  // console.dir(suggestedTags(parse('select i, j from a join b on 1=1')), {depth: null})
  console.dir(suggestedTags(sqlTablesAndColumns(`select count(*), * from foo where y = null`)), {depth: null})
  console.dir(suggestedTags(sqlTablesAndColumns(`select pg_advisory_lock(123), x, y from foo`)), {depth: null})
  console.dir(suggestedTags(sqlTablesAndColumns(`insert into foo(id) values (1) returning *`)), {depth: null})
  console.dir(suggestedTags(sqlTablesAndColumns(`insert into foo(id) values (1)`)), {depth: null})
  console.dir(suggestedTags(sqlTablesAndColumns(`update foo set bar = 'baz' returning *`)), {depth: null})
  console.dir(suggestedTags(sqlTablesAndColumns(`select foo.x from foo where y = null`)), {depth: null})
}
