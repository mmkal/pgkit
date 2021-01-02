import * as lodash from 'lodash'
import {DescribedQuery} from '../types'
import {getViewFriendlySql} from '.'
import {sql, DatabasePoolType} from 'slonik'

const getTypesSql = sql`
  drop type if exists types_type cascade;

  create type types_type as (
    schema_name text,
    view_name text,
    table_column_name text,
    query_column_name text,
    udt_name name,
    max_length int,
    is_nullable text,
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
      case when c.character_maximum_length is not null
        then c.character_maximum_length
        else c.numeric_precision end as max_length,
      c.is_nullable,
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

  --execute 'drop view if exists ' || v_tmp_name;

  end;
  $$
  LANGUAGE 'plpgsql';
`
// todo: logging
// todo: search for non-type-tagged queries and use a heuristic to guess a good name from them
// using either sql-surveyor or https://github.com/oguimbal/pgsql-ast-parser

export const nullablise = (pool: DatabasePoolType) => {
  const createViewAnalyser = lodash.once(() => pool.query(getTypesSql))
  return async (query: DescribedQuery): Promise<DescribedQuery> => {
    const viewFriendlySql = getViewFriendlySql(query.template)

    await createViewAnalyser()

    const viewResult = await pool.any(sql<{
      table_column_name: string
      underlying_table_name: string
      is_underlying_nullable: string
    }>`
      select table_column_name, underlying_table_name, is_underlying_nullable
      from gettypes(${viewFriendlySql})
    `)

    return {
      ...query,
      fields: query.fields.map(f => {
        const res = viewResult.find(v => f.name === v.table_column_name)
        return {
          ...f,
          column: res && {
            name: f.name,
            table: res.underlying_table_name!.toString(),
            notNull: res.is_underlying_nullable === 'NO',
          },
        }
      }),
    }
  }
}
