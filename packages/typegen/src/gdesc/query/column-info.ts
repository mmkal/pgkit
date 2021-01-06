import * as lodash from 'lodash'
import {AnalysedQuery, AnalysedQueryField, DescribedQuery, QueryField} from '../types'
import {getViewFriendlySql} from '.'
import {sql, DatabasePoolType} from 'slonik'
import * as parse from './index'
import {getHopefullyViewableAST, getSuggestedTags} from './parse'
import * as assert from 'assert'
import {tryOr, tryOrNull} from '../util'

// todo: create a schema to put these in?
const getTypesSql = sql`
drop type if exists types_type cascade;

create type types_type as (
  schema_name text,
  view_name text,
  table_column_name text,
  query_column_name text,
  udt_name name,
  comment text,
  underlying_table_name text,
  is_underlying_nullable text,
  formatted_query text
);

-- taken from https://dataedo.com/kb/query/postgresql/list-views-columns
-- and https://www.cybertec-postgresql.com/en/abusing-postgresql-as-an-sql-beautifier
-- nullable: https://stackoverflow.com/a/63980243
create or replace function gettypes(text)
returns setof types_type as
$$
declare
  v_tmp_name text;
  sql_query alias for $1;
  returnrec types_type;
  rec types_type;
begin
  v_tmp_name := 'temp2_' || md5(sql_query);
  execute 'drop view if exists ' || v_tmp_name;
  execute 'create view ' || v_tmp_name || ' as ' || sql_query;

  FOR returnrec in
  select
    vcu.table_schema as schema_name,
    vcu.view_name as view_name,
    c.column_name,
    vcu.column_name,
    c.table_name,
    col_description(
      to_regclass(quote_ident(c.table_schema) || '.' || quote_ident(c.table_name)),
      c.ordinal_position
    ),
    vcu.table_name as underlying_table_name,
    c.is_nullable as is_underlying_nullable,
    pg_get_viewdef(v_tmp_name) as formatted_query
  from
    information_schema.columns c
  join
    information_schema.view_column_usage vcu
      on c.table_name = vcu.table_name
      and c.column_name = vcu.column_name
  where
    c.table_name = v_tmp_name
    or vcu.view_name = v_tmp_name -- todo: this includes too much! columns  which are part of table queried but not selected
loop
  return next returnrec;
end loop;

execute 'drop view if exists ' || v_tmp_name;

end;
$$
LANGUAGE 'plpgsql';
`

// todo: logging
// todo: get table description from obj_description(oid) (like column)

export const columnInfoGetter = (pool: DatabasePoolType) => {
  const createViewAnalyser = lodash.once(() => pool.query(getTypesSql))

  const addColumnInfo = async (query: DescribedQuery): Promise<AnalysedQuery> => {
    const viewFriendlySql = getViewFriendlySql(query.template)
    const suggestedTags = getSuggestedTags(query.template).concat(['Anonymous'])

    await createViewAnalyser()

    const viewResultQuery = sql<queries.Anonymous>`
      select schema_name, table_column_name, underlying_table_name, is_underlying_nullable, comment, formatted_query
      from public.gettypes(${viewFriendlySql})
    `

    const ast = getHopefullyViewableAST(viewFriendlySql)
    if (ast.type !== 'select') {
      return {
        ...query,
        suggestedTags,
        fields: query.fields.map(defaultAnalysedQueryField),
      }
    }

    const viewResult = await pool.any(viewResultQuery).then(results => lodash.uniqBy(results, JSON.stringify))

    const formattedSqlStatements = [...new Set(viewResult.map(r => r.formatted_query))]

    assert.ok(formattedSqlStatements.length <= 1, `Expected exactly 1 formatted sql, got ${formattedSqlStatements}`)

    const parseableSql = formattedSqlStatements[0] || viewFriendlySql

    const parsed = tryOr(
      () => parse.getAliasMappings(parseableSql),
      () => parse.getAliasMappings(viewFriendlySql), // If parsing failed for the formatted query, try the unformatted one: https://github.com/oguimbal/pgsql-ast-parser/issues/1#issuecomment-754072470
    )()

    return {
      ...query,
      suggestedTags,
      fields: query.fields.map(f => {
        const relatedResults = parsed.flatMap(c =>
          viewResult.filter(v => {
            assert.ok(v.underlying_table_name, `Table name for ${JSON.stringify(c)} not found`)
            return (
              c.queryColumn === f.name &&
              c.tablesColumnCouldBeFrom.includes(v.underlying_table_name) &&
              c.aliasFor === v.table_column_name
            )
          }),
        )
        // todo: make sure schema is correct. possibly two tables in different schemas but with same names could give extra results here
        const res = relatedResults.length === 1 ? relatedResults[0] : undefined
        const notNull = res?.is_underlying_nullable === 'NO' || Boolean(isFieldNotNull(parseableSql, f))

        return {
          ...f,
          notNull,
          column: res && `${res.schema_name}.${res.underlying_table_name}.${res.table_column_name}`,
          comment: res?.comment || undefined,
        }
      }),
    }
  }

  return async (query: DescribedQuery): Promise<AnalysedQuery> =>
    addColumnInfo(query).catch(e => {
      // console.error({e})
      const suggestedTags = tryOrNull(() => getSuggestedTags(query.template)) || ['Anonymous']
      return {
        ...query,
        suggestedTags,
        fields: query.fields.map(defaultAnalysedQueryField),
      }
    })
}

export const defaultAnalysedQueryField = (f: QueryField): AnalysedQueryField => ({
  ...f,
  notNull: false,
  comment: undefined,
  column: undefined,
})

export const isFieldNotNull = (sql: string, field: QueryField) => {
  const ast = getHopefullyViewableAST(sql)
  const getMatchingCountColumns = () =>
    ast.type === 'select' &&
    ast.columns &&
    ast.columns.filter(c => {
      if (c.expr.type !== 'call' || c.expr.function !== 'count') {
        return false
      }
      const name = c.alias || 'count'
      return field.name === name
    })

  const matchingCountColumns = getMatchingCountColumns()
  return matchingCountColumns && matchingCountColumns.length === 1 // If we found exactly one field which looks like the result of a `count(...)`, we can be sure it's not null.
}

module queries {
  /** - query: `select schema_name, table_column_name, u... [truncated] ...formatted_query from public.gettypes($1)` */
  export interface Anonymous {
    /** postgres type: `text` */
    schema_name: string | null

    /** postgres type: `text` */
    table_column_name: string | null

    /** postgres type: `text` */
    underlying_table_name: string | null

    /** postgres type: `text` */
    is_underlying_nullable: string | null

    /** postgres type: `text` */
    comment: string | null

    /** postgres type: `text` */
    formatted_query: string | null
  }
}
