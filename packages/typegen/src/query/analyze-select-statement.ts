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
      .update(JSON.stringify([modifiedAST, 2]))
      .digest('hex')
      .slice(0, 6)
  const schemaIdentifier = sql.identifier([schemaName])

  return client.transaction(async tx => {
    await tx.query(sql`create schema if not exists ${schemaIdentifier}`)
    await tx.query(sql`
      set search_path to ${schemaIdentifier}, ${sql.raw(await tx.oneFirst<{search_path: string}>(sql`show search_path`))};
    `)
    await createAnalyzeSelectStatementColumnsFunction(tx, schemaName)

    /** puts fake tables into the temporary schema so that our analyze_select_statement_columns function can find the right types/nullability */
    const insertPrerequisites = async (
      analyzed: SelectStatementAnalyzedColumn[],
      statement: ModifiedAST['ast'],
      options: {
        tableAlias: string
        source: string
      },
    ) => {
      const aliasInfoList = getAliasInfo(statement)
      const aliasList = analyzed[0]?.column_aliases || []

      const tempTableColumns = aliasList.map(aliasName => {
        const aliasInfo = aliasInfoList.find(info => info.queryColumn === aliasName)
        if (!aliasInfo) throw new Error(`Alias ${aliasName} not found in statement`)

        const analyzedResult = analyzed.find(a => a.table_column_name === aliasInfo.aliasFor)
        if (!analyzedResult) throw new Error(`Alias ${aliasName} not found in analyzed results`)

        const def = `${aliasName} ${analyzedResult.underlying_data_type} ${analyzedResult.is_underlying_nullable === 'NO' ? 'not null' : ''}`

        const comment = `From ${options.source} "${options.tableAlias}", column source: ${analyzedResult.schema_name}.${analyzedResult.underlying_table_name}.${analyzedResult.table_column_name}`
        return {
          name: aliasName,
          def,
          comment,
        }
      })

      const raw = sql.raw(`
        drop table if exists ${schemaName}.${options.tableAlias};
        create table ${schemaName}.${options.tableAlias}(
          ${tempTableColumns.map(c => c.def).join(',\n')}
        );

        ${tempTableColumns
          .map(c => {
            return `comment on column ${schemaName}.${options.tableAlias}.${c.name} is '${c.comment}';`
          })
          .join('\n')}
      `)
      await tx.query(raw)
    }

    if (modifiedAST.modifications.includes('cte')) {
      const ast = parse(modifiedAST.originalSql)[0]
      if (ast.type !== 'with') throw new Error('Expected a WITH clause, got ' + toSql.statement(ast))

      for (const {statement, alias: tableAlias} of ast.bind) {
        const modifiedAst = getASTModifiedToSingleSelect(toSql.statement(statement))
        const analyzed = await analyzeSelectStatement(tx, modifiedAst)

        await insertPrerequisites(analyzed, statement, {
          tableAlias: tableAlias.name,
          source: 'CTE subquery',
        })
      }
      return analyzeSelectStatement(tx, getASTModifiedToSingleSelect(toSql.statement(ast.in)))
    }

    if (modifiedAST.ast.type === 'select' && modifiedAST.ast.from) {
      if (!modifiedAST.ast.from)
        throw new Error(`Expected a FROM clause, got ${JSON.stringify(modifiedAST.ast, null, 2)}`)
      const swappableFunctionIndexes = modifiedAST.ast.from.flatMap((f, i) =>
        f.type === 'call' && f.function ? [i] : [],
      )
      const swappedAst = {...modifiedAST.ast, from: modifiedAST.ast.from.slice()}
      for (const i of swappableFunctionIndexes) {
        const f = modifiedAST.ast.from[i]
        if (f.type !== 'call') throw new Error(`Expected a call, got ${JSON.stringify(f)}`)
        const tableReplacement: (typeof modifiedAST.ast.from)[number] = {
          type: 'table',
          name: f.alias ? {name: f.function.name, alias: f.alias.name} : f.function,
        }
        swappedAst.from[i] = tableReplacement
        const functionDefinitions = await tx.any<{prosrc: string; proargnames: string[]; proargmodes: string[]}>(sql`
          select prosrc, proargnames, proargmodes::text[]
          from pg_proc
          join pg_language on pg_language.oid = pg_proc.prolang
          where pg_language.lanname = 'sql'
          and proname = ${f.function.name}
          limit 2
        `)
        const functionDefinition = functionDefinitions.length === 1 ? functionDefinitions[0] : null
        if (!functionDefinition) {
          // maybe not a sql function, or an overloaded one, we don't handle this for now. Some types may be nullable as a result.
          continue
        }

        let underlyingFunctionDefinition = functionDefinition.prosrc

        for (const [index, argname] of functionDefinition.proargnames.entries()) {
          const argmode = functionDefinition.proargmodes?.[index]
          // maybe: we should allow argmode to be undefined here, functions that return primitives seem to have no proargmodes value
          if (argmode !== 'i') {
            continue
          }
          const regexp = new RegExp(/\bargname\b/.source.replace('argname', argname), 'g')
          underlyingFunctionDefinition = underlyingFunctionDefinition.replaceAll(regexp, `null`)
        }
        const statement = getASTModifiedToSingleSelect(underlyingFunctionDefinition)
        const analyzed = await analyzeSelectStatement(tx, statement)

        if (analyzed.length > 0) {
          await insertPrerequisites(analyzed, statement.ast, {
            tableAlias: f.function.name,
            source: 'function',
          })
        }
      }
      if (swappableFunctionIndexes.length > 0) {
        return analyzeSelectStatement(tx, getASTModifiedToSingleSelect(toSql.statement(swappedAst)))
      }
    }
    // if (modifiedAST.ast.type === 'select' && modifiedAST.ast.from.some(f => f.type === 'call' && f.function)) {

    // }

    const getResults = async () => {
      const rows = await tx.any(
        sql`select * from ${sql.identifier([schemaName, 'analyze_select_statement_columns'])}(${selectStatementSql})`,
      )
      return SelectStatementAnalyzedColumnSchema.array().parse(rows)
    }

    let results = await getResults()

    for (const r of results) {
      if (r.error_message) {
        console.warn(`Error analyzing select statement: ${r.error_message}`)
      }
    }

    const viewsWeNeedToAnalyze = new Map(
      results.flatMap(r => (r.underlying_table_type === 'VIEW' ? [[r.underlying_table_name, r] as const] : [])),
    )
    if (viewsWeNeedToAnalyze.size > 0) {
      for (const [viewName, result] of viewsWeNeedToAnalyze) {
        const statement = getASTModifiedToSingleSelect(result.underlying_view_definition)
        if (selectStatementSql === toSql.statement(statement.ast)) {
          throw new Error(
            `Circular view dependency detected: ${selectStatementSql} depends on ${result.underlying_view_definition}`,
          )
        }
        // console.log('first, going to analyze view', viewDefinition)
        const analyzed = await analyzeSelectStatement(tx, statement)
        await insertPrerequisites(analyzed, statement.ast, {
          tableAlias: viewName,
          source: 'view',
        })
      }
      results = await getResults()
    }

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
  underlying_table_type: z.string().nullable(),

  underlying_view_definition: z.string().nullable(),

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
    // eslint-disable-next-line unicorn/template-indent
    `
drop type if exists types_type cascade;

create type types_type as (
  error_message text,
  schema_name text,
  view_name text,
  table_column_name text,
  query_column_name text,
  column_aliases text[],
  comment text,
  underlying_table_name text,
  underlying_table_type text,
  underlying_view_definition text,
  is_underlying_nullable text,
  underlying_data_type text,
  formatted_query text
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
    returnrec := ('Error: ' || v_error_message || ' sql: ' || sql_query, null);
    return next returnrec;
    return;
  end;

  -- If we've made it here, the view was created successfully
  for returnrec in
    select
      null as error_message,
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
      underlying_table.table_type as underlying_table_type,
      case
        when underlying_table.table_type = 'VIEW' then
          pg_get_viewdef(underlying_table.table_name)
        else
          null
      end as underlying_view_definition,
      c.is_nullable as is_underlying_nullable,
      c.data_type as underlying_data_type,
      pg_get_viewdef(v_tmp_name) as formatted_query
    from
      information_schema.columns c
    join
      information_schema.view_column_usage
        on c.table_name = view_column_usage.table_name
        and c.column_name = view_column_usage.column_name
        and c.table_schema = view_column_usage.table_schema
      join information_schema.tables underlying_table
        on c.table_name = underlying_table.table_name
        and c.table_schema = underlying_table.table_schema
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
  returnrec := ('Error: ' || v_error_message || ' sql: ' || sql_query, null);
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
