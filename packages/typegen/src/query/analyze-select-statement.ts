import {Client, Queryable, sql} from '@pgkit/client'
import * as assert from 'assert'
import * as lodash from 'lodash'
import {toSql} from 'pgsql-ast-parser'
import {z} from 'zod'
import {ModifiedAST} from './parse'

/**
 * Returns a list of results that stem from a special query used to retrieve type information from the database.
 * @param client
 * @param selectStatementSql the query to be analysed - must be a single select statement
 */
export const analyzeSelectStatement = async (
  client: Client,
  modifiedAST: ModifiedAST,
): Promise<SelectStatementAnalyzedColumn[]> => {
  if (modifiedAST.modifications.includes('cte')) {
    const ast = modifiedAST.ast
    if (ast.type !== 'with') throw new Error('Expected a WITH clause, got ' + toSql.statement(ast))

    // todo: iterate through the bind queries and analyze them, so we can replace the final query with their types
    // const previouses = await Promise.all(
    // )
    return []
  }

  const selectStatementSql = toSql.statement(modifiedAST.ast)

  const viewResultQuery = sql<SelectStatementAnalyzedColumn>`
    select
      schema_name,
      table_column_name,
      underlying_table_name,
      is_underlying_nullable,
      underlying_data_type,
      comment,
      formatted_query
    from
      pg_temp.analyze_select_statement_columns(${selectStatementSql})
  `
  return client.transaction(async t => {
    await createAnalyzeSelectStatementColumnsFunction(t)
    const results = await t.any<SelectStatementAnalyzedColumn>(viewResultQuery)
    const deduped = lodash.uniqBy<SelectStatementAnalyzedColumn>(results, JSON.stringify)
    const formattedSqlStatements = lodash.uniqBy(deduped, r => r.formatted_query)

    assert.ok(
      formattedSqlStatements.length <= 1,
      `Expected exactly 1 formatted sql, got ${formattedSqlStatements.length}`,
    )

    return deduped
  })
}

// can't use typegen here because it relies on a function in a temp schema
export const SelectStatementAnalyzedColumnSchema = z.object({
  /** postgres type: `text` */
  schema_name: z.string().nullable(),

  /** postgres type: `text` */
  table_column_name: z.string().nullable(),

  /** postgres type: `text` */
  underlying_table_name: z.string().nullable(),

  /** postgres type: `text` */
  is_underlying_nullable: z.string().nullable(),

  /** looks like `integer`, `text`, `USER-DEFINED` etc., at time of writing can't remember if that means it's a pgtype or a regtype or what */
  underlying_data_type: z.string().nullable(),

  /** postgres type: `text` */
  comment: z.string().nullable(),

  /** postgres type: `text` */
  formatted_query: z.string().nullable(),
})

export type SelectStatementAnalyzedColumn = z.infer<typeof SelectStatementAnalyzedColumnSchema>

/**
 * A query, which creates a tmp table for the purpose of analysing types of another query
 */
const createAnalyzeSelectStatementColumnsFunction = async (queryable: Queryable) => {
  const query = sql.type(SelectStatementAnalyzedColumnSchema)`
    drop type if exists pg_temp.types_type cascade;

    create type pg_temp.types_type as (
      schema_name text,
      view_name text,
      table_column_name text,
      query_column_name text,
      comment text,
      underlying_table_name text,
      is_underlying_nullable text,
      underlying_data_type text,
      formatted_query text
    );

    -- taken from https://dataedo.com/kb/query/postgresql/list-views-columns
    -- and https://www.cybertec-postgresql.com/en/abusing-postgresql-as-an-sql-beautifier
    -- nullable: https://stackoverflow.com/a/63980243

    create or replace function pg_temp.analyze_select_statement_columns(sql_query text)
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
        c.data_type as underlying_data_type,
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
  await queryable.query(query)
}
