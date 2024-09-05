import {Queryable, sql, Transactable} from '@pgkit/client'
import * as assert from 'assert'
import {createHash} from 'crypto'
import * as lodash from 'lodash'
import {parse, toSql} from 'pgsql-ast-parser'
import {z} from 'zod'
import {getAliasInfo, getASTModifiedToSingleSelect, ModifiedAST} from './parse'

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

  const schemaName =
    'pgkit_typegen_temp_schema_' +
    createHash('md5')
      .update(JSON.stringify([modifiedAST]))
      .digest('hex')
      .slice(0, 6)
  const schemaIdentifier = sql.identifier([schemaName])

  return client.transaction(async tx => {
    await tx.query(sql`create schema if not exists ${schemaIdentifier}`)
    await tx.query(sql`
      set search_path to ${schemaIdentifier}, ${sql.raw(await tx.oneFirst<{search_path: string}>(sql`show search_path`))};
    `)
    await createAnalyzeSelectStatementColumnsFunction(tx, schemaName)

    if (modifiedAST.modifications.includes('cte')) {
      if (!process.env.EXPERIMENTAL_CTE_TEMP_SCHEMA) {
        return []
      }

      const ast = parse(modifiedAST.originalSql)[0]
      if (ast.type !== 'with') throw new Error('Expected a WITH clause, got ' + toSql.statement(ast))

      for (const {statement, alias: tableAlias} of ast.bind) {
        const modifiedAst = getASTModifiedToSingleSelect(toSql.statement(statement))
        const analyzed = await analyzeSelectStatement(tx, modifiedAst)

        const aliasInfoList = getAliasInfo(statement)
        const aliasList = analyzed[0].column_aliases

        const tempTableColumns = aliasList.map(aliasName => {
          const aliasInfo = aliasInfoList.find(info => info.queryColumn === aliasName)
          if (!aliasInfo) throw new Error(`Alias ${aliasName} not found in statement`)

          const analyzedResult = analyzed.find(a => a.table_column_name === aliasInfo.aliasFor)
          if (!analyzedResult) throw new Error(`Alias ${aliasName} not found in analyzed results`)

          const def = `${aliasName} ${analyzedResult.underlying_data_type} ${analyzedResult.is_underlying_nullable === 'NO' ? 'not null' : ''}`

          const comment = `From CTE subquery "${tableAlias.name}", column source: ${analyzedResult.schema_name}.${analyzedResult.underlying_table_name}.${analyzedResult.table_column_name}`
          return {
            name: aliasName,
            def,
            comment,
          }
        })

        const raw = sql.raw(`
          drop table if exists ${schemaName}.${tableAlias.name};
          create table ${schemaName}.${tableAlias.name}(
            ${tempTableColumns.map(c => c.def).join(',\n')}
          );

          ${tempTableColumns
            .map(c => {
              return `comment on column ${schemaName}.${tableAlias.name}.${c.name} is '${c.comment}';`
            })
            .join('\n')}
        `)
        await tx.query(raw)
      }
      return analyzeSelectStatement(tx, getASTModifiedToSingleSelect(toSql.statement(ast.in)))
    }

    const rows = await tx.any(
      sql`
        select
          schema_name,
          table_column_name,
          underlying_table_name,
          is_underlying_nullable,
          column_aliases,
          underlying_data_type,
          comment,
          formatted_query,
          error_message
        from
          ${sql.identifier([schemaName, 'analyze_select_statement_columns'])}(${selectStatementSql})
      `,
    )

    const results = SelectStatementAnalyzedColumnSchema.array().parse(rows)

    const deduped = lodash.uniqBy<SelectStatementAnalyzedColumn>(results, JSON.stringify)
    const formattedSqlStatements = lodash.uniqBy(deduped, r => r.formatted_query)

    assert.ok(
      formattedSqlStatements.length <= 1,
      `Expected exactly 1 formatted sql, got ${formattedSqlStatements.length}`,
    )
    await tx.query(sql`drop schema if exists ${schemaIdentifier} cascade`)

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
  is_underlying_nullable: z.enum(['YES', 'NO']).nullable(),

  /** ordered array of the column aliases in the query. you'll have to match them up separately because view_column_usage doesn't order the columns */
  column_aliases: z.array(z.string()).nullable(),

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
const createAnalyzeSelectStatementColumnsFunction = async (queryable: Queryable, schemaName: string) => {
  // todo: figure out why sql.identifier is giving syntax errors
  const query = sql.raw(
    `
      drop type if exists types_type cascade;

      create type types_type as (
        schema_name text,
        view_name text,
        table_column_name text,
        query_column_name text,
        column_aliases text[],
        comment text,
        underlying_table_name text,
        is_underlying_nullable text,
        underlying_data_type text,
        formatted_query text,
        error_message text
      );

      create or replace function analyze_select_statement_columns (sql_query text)
      returns setof types_type as
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
          returnrec := (null, null, null, null, null, null, null, null, null, null, 'Error: ' || v_error_message);
          return next returnrec;
          return;
        end;

        -- If we've made it here, the view was created successfully
        for returnrec in
          select
            view_column_usage.table_schema as schema_name,
            view_column_usage.view_name as view_name,
            c.column_name as table_column_name,
            view_column_usage.column_name as query_column_name,
            (
              select array_agg(attname) from (
                select attname from pg_attribute where attrelid = v_tmp_name::regclass order by attnum
              ) t
            ) as column_aliases,
            --'originally from table: ' || view_column_usage.table_name as comment,
            col_description(
              to_regclass(quote_ident(c.table_schema) || '.' || quote_ident(c.table_name)),
              c.ordinal_position
            ) as comment,
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
            or view_column_usage.view_name = v_tmp_name
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
        returnrec := (null, null, null, null, null, null, null, null, null, null, 'Error: ' || v_error_message);
        return next returnrec;
      end;
      $$
      language plpgsql;
    `
      .replaceAll('types_type', `${schemaName}.types_type`)
      .replaceAll('analyze_select_statement_columns', `${schemaName}.analyze_select_statement_columns`),
  )
  await queryable.query(query)
}
