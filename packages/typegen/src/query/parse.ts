import * as pgsqlAST from 'pgsql-ast-parser'
import * as lodash from 'lodash'
import {pascalCase, tryOrDefault} from '../util'
import {match} from 'io-ts-extra'
import * as assert from 'assert'
import * as pluralize from 'pluralize'

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
  const usesIdentifier = () =>
    tryOrDefault(() => {
      let usesIdentifierPlaceholder = false

      const fakeTableName = `t${Math.random()}`.replace('0.', '')
      pgsqlAST
        .astVisitor(map => ({
          tableRef: t => {
            if (t.name === fakeTableName) {
              usesIdentifierPlaceholder = true
            }
            map.super().tableRef(t)
          },
        }))
        .statement(getHopefullyViewableAST(template.join(fakeTableName)))

      return usesIdentifierPlaceholder
    }, null)

  const hasTooManyStatements = () =>
    tryOrDefault(() => {
      const statements = pgsqlAST.parse(templateToValidSql(template))

      return statements.length !== 1
    }, null)

  return Boolean(usesIdentifier() || hasTooManyStatements())
}

// todo: return null if statement is not a select
// and have test cases for when a view can't be created
// export const getHopefullyViewableAST = (sql: string): pgsqlAST.Statement => {
//   const statements = parseWithWorkarounds(sql)
//   assert.ok(statements.length === 1, `Can't parse query ${sql}; it has ${statements.length} statements.`)
//   return astToSelect({modifications: [], ast: statements[0]}).ast
// }

const getModifiedAST = (sql: string): ModifiedAST => {
  const statements = parseWithWorkarounds(sql)
  assert.ok(statements.length === 1, `Can't parse query ${sql}; it has ${statements.length} statements.`)
  return astToSelect({modifications: [], ast: statements[0]})
}

export const parseWithWorkarounds = (sql: string, attemptsLeft = 2): pgsqlAST.Statement[] => {
  try {
    return pgsqlAST.parse(sql)
  } catch (e) {
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
          if (prev.endsWith(' as')) {
            if (state.parenLevel === 1) {
              state.cteStart = i
            }
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
  modifications: ('cte' | 'returning')[]
  ast: pgsqlAST.Statement
}

const astToSelect = ({modifications, ast}: ModifiedAST): ModifiedAST => {
  if ((ast.type === 'update' || ast.type === 'insert') && ast.returning) {
    return {
      modifications: [...modifications, 'returning'],
      ast: {
        type: 'select',
        from: [
          {
            type: 'table',
            name: ast.type === 'update' ? ast.table.name : ast.into.name,
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
  const ast = getHopefullyViewableAST(sql)

  if (ast.type === 'select') {
    return {
      tables: ast.from
        ?.map(f =>
          match(f)
            .case({type: 'table'} as const, t => t.name)
            .case({alias: String}, f => f.alias)
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
): Array<{queryColumn: string; aliasFor: string; tablesColumnCouldBeFrom: string[]; hasNullableJoin: boolean}> => {
  assert.strictEqual(statement.type, 'select' as const)
  assert.ok(statement.columns, `Can't get alias mappings from query with no columns`)

  interface QueryTableReference {
    table: string
    referredToAs: string
    /** even if a column is non-null, if its table is joined via `LEFT JOIN` or `FULL OUTER JOIN`, the value can be null in the resultant query */
    nullableJoin: boolean
  }

  const allTableReferences: QueryTableReference[] = []

  pgsqlAST
    .astVisitor(map => ({
      tableRef: t =>
        allTableReferences.push({
          table: t.name,
          referredToAs: t.alias || t.name,
          nullableJoin: ['LEFT JOIN', 'FULL JOIN'].includes((t as any)?.join?.type),
        }),
      join: t => map.super().join(t),
    }))
    .statement(statement)

  const availableTables = lodash.uniqBy(allTableReferences, JSON.stringify)

  const aliasGroups = lodash.groupBy(availableTables, t => t.referredToAs)

  assert.ok(
    !lodash.some(aliasGroups, group => group.length > 1),
    `Some aliases are duplicated, this is too confusing. ${JSON.stringify({aliasGroups})}`,
  )

  const mappings = statement.columns
    .map(c => {
      const tableReferences = availableTables.filter(t =>
        c.expr.type === 'ref' && c.expr.table ? c.expr.table === t.referredToAs : true,
      )
      return {
        queryColumn: c.alias,
        aliasFor: c.expr.type === 'ref' ? c.expr.name : '',
        tablesColumnCouldBeFrom: tableReferences.map(t => t.table),
        hasNullableJoin: tableReferences.some(t => t.nullableJoin),
      }
    })
    .map(c => ({...c, queryColumn: c.queryColumn || c.aliasFor}))
    .filter(c => c.queryColumn && c.aliasFor)

  return mappings
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

export const getHopefullyViewableAST = lodash.flow(getModifiedAST, m => m.ast)

export const isCTE = lodash.flow(templateToValidSql, getModifiedAST, m => m.modifications.includes('cte'))

export const getSuggestedTags = lodash.flow(templateToValidSql, sqlTablesAndColumns, suggestedTags)

export const getViewFriendlySql = lodash.flow(templateToValidSql, getHopefullyViewableAST, pgsqlAST.toSql.statement)

export const getAliasMappings = lodash.flow(getHopefullyViewableAST, aliasMappings)

/* istanbul ignore if */
if (require.main === module) {
  console.log = (...x: any[]) => console.dir(x.length === 1 ? x[0] : x, {depth: null})

  // console.log(getHopefullyViewableAST('select other.content as id from messages join other on shit = id where id = 1'))
  // console.log(isUntypable([`select * from `, ` where b = hi`]))
  // console.log(isUntypable([`select * from a where b = `, ``]))
  // console.log(
  //   isUntypeable([
  //     '\n' + '  insert into test_table(id, n) values (1, 2);\n' + '  insert into test_table(id, n) values (3, 4);\n',
  //   ]),
  // )
  const exprName = (e: pgsqlAST.Expr) => {
    if ('name' in e && typeof e.name === 'string') {
      return e.name
    }
    return null
  }
  const opNames: Record<pgsqlAST.BinaryOperator, string | null> = {
    '!=': 'ne',
    '#-': null,
    '%': 'modulo',
    '&&': null,
    '*': 'times',
    '+': 'plus',
    '-': 'minus',
    '/': 'divided_by',
    '<': 'less_than',
    '<=': 'lte',
    '<@': null,
    '=': 'equals',
    '>': 'greater_than',
    '>=': 'gte',
    '?': null,
    '?&': null,
    '?|': null,
    '@>': null,
    'NOT ILIKE': 'not_ilike',
    'NOT IN': 'not_in',
    'NOT LIKE': 'not_like',
    '^': 'to_the_power_of',
    '||': 'concat',
    AND: 'and',
    ILIKE: 'ilike',
    IN: 'in',
    LIKE: 'like',
    OR: 'or',
  }
  // console.log(`
  //   select *
  //   from a
  //   join top_x(1, 2) as p on b = c
  // `)
  // throw 'end'
  console.log(getHopefullyViewableAST(require('./testquery.ignoreme').default))
  throw 'end'
  pgsqlAST
    .astVisitor(map => ({
      expr: e => {
        const grandChildren =
          // Object.values(e) ||
          Object.values(e).flatMap(child =>
            // [child] || //
            child && typeof child === 'object' ? Object.values(child) : [],
          )
        console.log({e, grandChildren})
        if (grandChildren.some(e => JSON.stringify(e).startsWith('{"type":"parameter'))) {
        }
        console.log(pgsqlAST.toSql.statement(getHopefullyViewableAST('select id from messages where id <= $1')), 444555)
        // console.log({e})

        // if (Object.values(e).some(v => JSON.stringify(v).startsWith(`{"type":"parameter"`))) {
        //   console.log(112)

        //   if (e.type === 'binary') {
        //     const params = [e.left, e.right].filter(
        //       (side): side is pgsqlAST.ExprParameter => side.type === 'parameter',
        //     )
        //     params.forEach(p => {
        //       const names = [e.left, e.right].map(exprName)
        //       console.log(112, {names})
        //       if (names.every(Boolean) && opNames[e.op]) {
        //         console.log({
        //           param: p.name,
        //           readable: names.join(`_${opNames[e.op]}_`),
        //           orig: pgsqlAST.toSql.expr(e),
        //         })
        //       }
        //     })
        // }
        // }
        return map.super().expr(e)
      },
      // parameter: e => ({type: 'ref', name: 'SPLITTABLE'}),
    }))
    .statement(getHopefullyViewableAST('select id from messages where id <= $1'))!
  console.log(getHopefullyViewableAST(`select * from test_table where id = 'placeholder_parameter_$1' or id = 'other'`))
  pgsqlAST
    .astVisitor(map => ({
      constant: t => {
        console.log({t}, map.super())
        return map.super().constant(t)
      },
    }))
    .statement(
      getHopefullyViewableAST(`select * from test_table where id = 'placeholder_parameter_$1' or id = 'other'`),
    )
  console.log(
    getHopefullyViewableAST(
      'SELECT "t1"."id"  FROM "test_table" AS "t1" INNER JOIN "test_table" AS "t2" ON ("t1"."id" = "t2"."n")',
    ),
  )
  console.log(getHopefullyViewableAST('select t1.id from test_table t1 join test_table t2 on t1.id = t2.n'))
  console.log(aliasMappings(getHopefullyViewableAST(`select a.a, b.b from atable a join btable b on a.i = b.j`)))
  console.log(getHopefullyViewableAST(`select * from (select id from test) d`))
  console.log(getHopefullyViewableAST(`select * from (values (1, 'one'), (2, 'two')) as vals (num, letter)`))
  console.log(
    pgsqlAST
      .astVisitor(map => ({
        tableRef: t => console.log({table: t.name, referredToAs: t.alias || t.name}),
        join: t => map.super().join(t),
      }))
      .statement(getHopefullyViewableAST('select 1 from (select * from t)')),
  )
  console.log(
    getHopefullyViewableAST(
      `select * from (values (1, 'one'), (2, 'two')) as vals (num, letter)` ||
        `drop table test` ||
        `
      BEGIN
        SELECT * INTO STRICT myrec FROM emp WHERE empname = myname;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                RAISE EXCEPTION 'employee % not found', myname;
            WHEN TOO_MANY_ROWS THEN
                RAISE EXCEPTION 'employee % not unique', myname;
      END
  `,
    ),
  )
  console.log(lodash.flow(getHopefullyViewableAST, aliasMappings)('select * from messages where id = 1'))
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
