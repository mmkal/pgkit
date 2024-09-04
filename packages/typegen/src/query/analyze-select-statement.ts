import {Queryable, sql, Transactable} from '@pgkit/client'
import * as assert from 'assert'
import * as lodash from 'lodash'
import {parse, toSql} from 'pgsql-ast-parser'
import {z} from 'zod'
import {getASTModifiedToSingleSelect, ModifiedAST} from './parse'

/**
 * Returns a list of results that stem from a special query used to retrieve type information from the database.
 * @param client
 * @param selectStatementSql the query to be analysed - must be a single select statement
 */
export const analyzeSelectStatement = async (
  client: Transactable,
  modifiedAST: ModifiedAST,
): Promise<SelectStatementAnalyzedColumn[]> => {
  const selectStatementSql = toSql.statement(modifiedAST.ast)

  return client.transaction(async tx => {
    await createAnalyzeSelectStatementColumnsFunction(tx)

    if (modifiedAST.modifications.includes('cte')) {
      if (!process.env.EXPERIMENTAL_CTE_TEMP_SCHEMA) {
        return []
      }
      await tx.query(sql`
        create schema mmkal_temp;
        set search_path to ${sql.raw(await tx.oneFirst<{search_path: string}>(sql`show search_path`))}, mmkal_temp;
      `)

      console.log(`search path is ${await tx.oneFirst<string>(sql`show search_path`)}`, modifiedAST)
      const ast = parse(modifiedAST.originalSql)[0]
      if (ast.type !== 'with') throw new Error('Expected a WITH clause, got ' + toSql.statement(ast))

      for (const {statement, alias} of ast.bind) {
        const modifiedAst = getASTModifiedToSingleSelect(toSql.statement(statement))
        const analyzed = await analyzeSelectStatement(tx, modifiedAst)

        const raw = sql.raw(`
          create table mmkal_temp.${alias.name}(
            ${analyzed.map(a => `${a.table_column_name} ${a.underlying_data_type}`).join(',\n')}
          )
        `)
        console.log(raw)
        await tx.query(raw)
      }
      return analyzeSelectStatement(tx, getASTModifiedToSingleSelect(toSql.statement(ast.in)))
    }

    const results = await tx.any(
      sql<SelectStatementAnalyzedColumn>`
        select
          schema_name,
          table_column_name,
          underlying_table_name,
          is_underlying_nullable,
          underlying_data_type,
          comment,
          formatted_query,
          error_message
        from
          pg_temp.analyze_select_statement_columns(${selectStatementSql})
      `,
    )

    const deduped = lodash.uniqBy<SelectStatementAnalyzedColumn>(results, JSON.stringify)
    const formattedSqlStatements = lodash.uniqBy(deduped, r => r.formatted_query)

    assert.ok(
      formattedSqlStatements.length <= 1,
      `Expected exactly 1 formatted sql, got ${formattedSqlStatements.length}`,
    )
    await tx.query(sql`drop schema if exists mmkal_temp cascade`).catch(e => {
      e.message += `${formattedSqlStatements.length} ${deduped[0]?.formatted_query || JSON.stringify(modifiedAST.originalSql)}`
      throw e
    })

    return deduped
  })
}

// can't use typegen here because it relies on a function in a temp schema
// todo(client): zod isn't parsing?
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

  error_message: z.string().nullable(),
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
      formatted_query text,
      error_message text
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
      v_error_message text;
    begin
      v_tmp_name := 'temp_view_' || md5(sql_query);
  
      -- Attempt to create the temporary view
      begin
        execute 'drop view if exists ' || v_tmp_name;
        execute 'create temporary view ' || v_tmp_name || ' as ' || sql_query;
      exception when others then
        -- Capture the error message
        get stacked diagnostics v_error_message = MESSAGE_TEXT;
        raise notice 'Error creating temporary view: %', v_error_message;
        -- Return an error record instead of raising an exception
        returnrec := (null, null, null, null, null, null, null, null, null, 'Error: ' || v_error_message);
        return next returnrec;
        return;
      end;

      -- If we've made it here, the view was created successfully
      for returnrec in
        select
          view_column_usage.table_schema as schema_name,
          view_column_usage.view_name as view_name,
          c.column_name,
          view_column_usage.column_name,
          col_description(
            to_regclass(quote_ident(c.table_schema) || '.' || quote_ident(c.table_name)),
            c.ordinal_position
          ),
          view_column_usage.table_name as underlying_table_name,
          c.is_nullable as is_underlying_nullable,
          c.data_type as underlying_data_type,
          pg_get_viewdef(v_tmp_name) as formatted_query,
          null as error_message
        from
          information_schema.columns c
        join
          information_schema.view_column_usage
            on c.table_name = view_column_usage.table_name
            and c.column_name = view_column_usage.column_name
            and c.table_schema = view_column_usage.table_schema
        where
          c.table_name = v_tmp_name
          or view_column_usage.view_name = v_tmp_name -- todo: this includes too much! columns  which are part of table queried but not selected
      loop
        return next returnrec;
      end loop;

      execute 'drop view if exists ' || v_tmp_name;

    exception when others then
      -- Capture any other errors that might occur
      get stacked diagnostics v_error_message = MESSAGE_TEXT;
      raise notice 'Error in analyze_select_statement_columns: %', v_error_message;
      -- Ensure we attempt to drop the view even if an error occurred
      execute 'drop view if exists ' || quote_ident(v_tmp_name);
      -- Return an error record
      returnrec := (null, null, null, null, null, null, null, null, null, 'Error: ' || v_error_message);
      return next returnrec;
    end;
    $$
    language plpgsql;
  `
  await queryable.query(query)
}
