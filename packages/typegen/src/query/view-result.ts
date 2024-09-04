import {Client, sql} from '@pgkit/client'
import * as assert from 'assert'
import * as lodash from 'lodash'

/**
 * Returns a list of results that stem from a special query used to retrieve type information from the database.
 * @param pool
 * @param viewFriendlySql the query to be analysed
 * @returns
 */
export const getViewResult = async (pool: Client, viewFriendlySql: string): Promise<ViewResult[]> => {
  const viewResultQuery = sql<ViewResult>`
    select
      schema_name,
      table_column_name,
      underlying_table_name,
      is_underlying_nullable,
      comment,
      formatted_query
    from
      pg_temp.gettypes(${viewFriendlySql})
  `
  return pool.transaction(async t => {
    await t.query(getTypesSql)
    const results = await t.any<ViewResult>(viewResultQuery)
    const deduped = lodash.uniqBy<ViewResult>(results, JSON.stringify)
    const formattedSqlStatements = lodash.uniqBy(deduped, r => r.formatted_query)

    assert.ok(
      formattedSqlStatements.length <= 1,
      `Expected exactly 1 formatted sql, got ${formattedSqlStatements.length}`,
    )

    return deduped
  })
}

// this query is for a type in a temp schema so this tool doesn't work with it
export type ViewResult = {
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

/**
 * A query, which creates a tmp table for the purpose of analysing types of another query
 */
const getTypesSql = sql`
  drop type if exists pg_temp.types_type cascade;

  create type pg_temp.types_type as (
    schema_name text,
    view_name text,
    table_column_name text,
    query_column_name text,
    comment text,
    underlying_table_name text,
    is_underlying_nullable text,
    formatted_query text
  );

  -- taken from https://dataedo.com/kb/query/postgresql/list-views-columns
  -- and https://www.cybertec-postgresql.com/en/abusing-postgresql-as-an-sql-beautifier
  -- nullable: https://stackoverflow.com/a/63980243

  create or replace function pg_temp.gettypes(sql_query text)
  returns setof pg_temp.types_type as
  $$
  declare
    v_tmp_name text;
    returnrec types_type;
  begin
    v_tmp_name := 'temp_view_' || md5(sql_query);
    execute 'drop view if exists ' || v_tmp_name;
    execute 'create temporary view ' || v_tmp_name || ' as ' || sql_query;

    FOR returnrec in
    select
      vcu.table_schema as schema_name,
      vcu.view_name as view_name,
      c.column_name,
      vcu.column_name,
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
        and c.table_schema = vcu.table_schema
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
