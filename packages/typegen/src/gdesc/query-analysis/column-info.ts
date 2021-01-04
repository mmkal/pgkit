import * as lodash from 'lodash'
import {AnalysedQuery, DescribedQuery, QueryField} from '../types'
import {getViewFriendlySql} from '.'
import {sql, DatabasePoolType} from 'slonik'
import * as parse from './index'
import {getHopefullyViewableAST} from './parse'

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

drop function if exists gettypes(text);

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

interface ViewResult {
  schema_name: string
  table_column_name: string
  underlying_table_name: string
  is_underlying_nullable: string
  comment: string
  formatted_query: string
}

// todo: logging
// todo: get table description from obj_description(oid) (like column)

export const columnInfoGetter = (pool: DatabasePoolType) => {
  const createViewAnalyser = lodash.once(() => pool.query(getTypesSql))

  const addColumnInfo = async (query: DescribedQuery): Promise<AnalysedQuery> => {
    const viewFriendlySql = getViewFriendlySql(query.template)

    await createViewAnalyser()

    const viewResultQuery = sql<ViewResult>`
      select schema_name, table_column_name, underlying_table_name, is_underlying_nullable, comment, formatted_query
      from gettypes(${viewFriendlySql})
    `

    const ast = getHopefullyViewableAST(viewFriendlySql)
    if (ast.type !== 'select') {
      return {
        ...query,
        fields: query.fields.map(f => ({
          ...f,
          notNull: false,
          column: undefined,
          comment: undefined,
        })),
      }
    }

    const viewResult = await pool.any(viewResultQuery).then(results => lodash.uniqBy(results, JSON.stringify))

    const formattedSqlStatements = [...new Set(viewResult.map(r => r.formatted_query))]
    if (formattedSqlStatements.length > 1) {
      throw new Error(`Expected exactly 1 formatted sql, got ${formattedSqlStatements}`)
    }

    const parseableSql = formattedSqlStatements[0] || viewFriendlySql

    const parsed = parse.getAliasMappings(parseableSql)

    return {
      ...query,
      fields: query.fields.map(f => {
        const relatedResults = parsed.flatMap(c =>
          viewResult.filter(v => {
            return (
              c.queryColumn === f.name &&
              c.tablesColumnCouldBeFrom.includes(v.underlying_table_name) &&
              c.aliasFor === v.table_column_name
            )
          }),
        )
        const res = relatedResults.length === 1 ? relatedResults[0] : undefined
        const notNull = res?.is_underlying_nullable === 'NO' || isFieldNotNull(parseableSql, f)

        return {
          ...f,
          notNull,
          column: res && `${res.schema_name}.${res.underlying_table_name}.${res.table_column_name}`,
          comment: res?.comment,
        }
      }),
    }
  }

  return async (query: DescribedQuery): Promise<AnalysedQuery> =>
    addColumnInfo(query).catch(e => {
      console.error({e})
      return {
        ...query,
        fields: query.fields.map(f => ({
          ...f,
          notNull: false,
          comment: undefined,
          column: undefined,
        })),
      }
    })
}

export const isFieldNotNull = (sql: string, field: QueryField) => {
  const ast = getHopefullyViewableAST(sql)
  if (ast.type === 'select' && ast.columns) {
    // special case: `count(...)` is always non-null
    const matchingCountColumns = ast.columns.filter(c => {
      if (c.expr.type !== 'call' || c.expr.function !== 'count') {
        return false
      }
      const name = c.alias || 'count'
      return field.name === name
    })
    return matchingCountColumns.length === 1 // If we found exactly one field which looks like the result of a `count(...)`, we can be sure it's not null.
  }

  return false
}
