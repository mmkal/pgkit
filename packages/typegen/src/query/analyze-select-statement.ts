import {Queryable, sql, Transactable} from '@pgkit/client'
import * as assert from 'assert'
import {createHash} from 'crypto'
import * as lodash from 'lodash'
import {parse, toSql, WithStatement} from 'pgsql-ast-parser'
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
  if (modifiedAST.ast.type === 'select' && modifiedAST.ast.columns) {
    const columns = modifiedAST.ast.columns
    const subqueryColumns = new Map(
      columns.flatMap((c, i) => {
        if (c.expr.type !== 'select') return []
        if (!c.alias?.name) return [] // todo: log a warning that adding an alias is recommended for better types
        const name = `subquery_${i}_for_column_${c.alias.name}`
        return [[i, {index: i, c, expr: c.expr, name, alias: c.alias.name}] as const]
      }),
    )
    if (subqueryColumns.size > 0) {
      const subqueryColumnValues = Array.from(subqueryColumns.values())
      const x: WithStatement = {
        type: 'with',
        bind: subqueryColumnValues.map((column): WithStatement['bind'][number] => ({
          alias: {name: column.name},
          statement: {
            ...column.expr,
            columns: column.expr.columns?.map(c => ({
              ...c,
              alias: {name: column.alias},
            })),
          },
        })),
        in: {
          ...modifiedAST.ast,
          columns: modifiedAST.ast.columns.map((c, i) => {
            const subqueryCol = subqueryColumns.get(i)
            if (!subqueryCol) return c
            return {
              expr: {
                type: 'ref',
                table: {name: subqueryCol.name},
                name: subqueryCol.alias,
              },
            }
          }),
          from: [
            ...(modifiedAST.ast.from || []),
            ...subqueryColumnValues.map(({name}): NonNullable<typeof modifiedAST.ast.from>[number] => {
              return {type: 'table', name: {name}}
            }),
          ],
        },
      }

      // console.log(toSql.statement(x))

      return analyzeSelectStatement(client, getASTModifiedToSingleSelect(toSql.statement(x)))
    }
  }

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
      const ast = parse(modifiedAST.originalSql)[0]
      if (ast.type !== 'with') throw new Error('Expected a WITH clause, got ' + toSql.statement(ast))

      for (const {statement, alias: tableAlias} of ast.bind) {
        const modifiedAst = getASTModifiedToSingleSelect(toSql.statement(statement))
        const analyzed = await analyzeSelectStatement(tx, modifiedAst)

        await insertPrerequisites(tx, schemaName, analyzed, statement, {
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
        const functionDefinitions = await tx.any(sql<queries.FunctionDefinition>`
          select prosrc, proargnames, proargmodes::text[]
          from pg_proc
          join pg_language on pg_language.oid = pg_proc.prolang
          where pg_language.lanname = 'sql'
          and proname = ${f.function.name}
          limit 2
        `)
        const functionDefinition = functionDefinitions.length === 1 ? functionDefinitions[0] : null
        if (!functionDefinition?.prosrc) {
          // maybe not a sql function, or an overloaded one, we don't handle this for now. Some types may be nullable as a result.
          continue
        }

        let underlyingFunctionDefinition = functionDefinition.prosrc

        for (const [index, argname] of (functionDefinition.proargnames || []).entries()) {
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
          await insertPrerequisites(tx, schemaName, analyzed, statement.ast, {
            tableAlias: f.function.name,
            source: 'function',
          })
        }
      }
      if (swappableFunctionIndexes.length > 0) {
        return analyzeSelectStatement(tx, getASTModifiedToSingleSelect(toSql.statement(swappedAst)))
      }
    }

    /** puts fake tables into the temporary schema so that our analyze_select_statement_columns function can find the right types/nullability */

    const AnalyzeSelectStatementColumnsQuery = (statmentSql: string) => sql`
      --typegen-ignore
      select * from ${sql.identifier([schemaName, 'analyze_select_statement_columns'])}(${statmentSql})
    `
    // todo: figure out why sql.type(MyZodType) isn't working here
    let results = SelectStatementAnalyzedColumnSchema.array().parse(
      await tx.any(AnalyzeSelectStatementColumnsQuery(selectStatementSql)),
    )

    if (results.length === 1 && results[0].error_message) {
      // try the original sql
      // todo: more efficient way to do this?
      results = SelectStatementAnalyzedColumnSchema.array().parse(
        await tx.any(AnalyzeSelectStatementColumnsQuery(modifiedAST.originalSql)),
      )
    }

    for (const r of results) {
      if (r.error_message) {
        // todo: start warning users.
        // or, maybe, make it logger.debug and show these with the `--debug` flag
        // and/or have a `--strict` flag that errors when there are any warnings - making this a kind of sql validator tool which is cool
        // eslint-disable-next-line unicorn/no-lonely-if
        if (process.env.NODE_ENV === 'test') {
          // eslint-disable-next-line no-console
          console.warn(`Error analyzing select statement: ${r.error_message}`, modifiedAST.originalSql)
        }
      }
    }

    const viewsWeNeedToAnalyze = new Map(
      results.flatMap(r => {
        const analyzeableView = r.underlying_table_type === 'VIEW' && r.underlying_view_definition
        return analyzeableView && r.underlying_table_name ? [[r.underlying_table_name, r] as const] : []
      }),
    )

    if (viewsWeNeedToAnalyze.size > 0) {
      for (const [viewName, result] of viewsWeNeedToAnalyze) {
        if (!result.underlying_view_definition) {
          throw new Error(
            `View ${viewName} has no underlying view definition: ${JSON.stringify({viewName, result}, null, 2)}`,
          )
        }
        const statement = getASTModifiedToSingleSelect(result.underlying_view_definition)
        if (selectStatementSql === toSql.statement(statement.ast)) {
          throw new Error(
            `Circular view dependency detected: ${selectStatementSql} depends on ${result.underlying_view_definition}`,
          )
        }
        const analyzed = await analyzeSelectStatement(tx, statement)
        await insertPrerequisites(tx, schemaName, analyzed, statement.ast, {
          tableAlias: viewName,
          source: 'view',
        })
      }
      // get results again - we have now inserted the view's dependencies as temp tables, so we should get fuller results
      results = SelectStatementAnalyzedColumnSchema.array().parse(
        await tx.any(AnalyzeSelectStatementColumnsQuery(selectStatementSql)),
      )
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
  is_underlying_nullable: z.enum(['YES', 'NO']).nullable(),

  /** postgres type: `text` */
  underlying_table_type: z.string().nullable(),

  underlying_view_definition: z.string().nullable(),

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
  is_underlying_nullable text,
  underlying_data_type text,
  formatted_query text,
  underlying_table_type text,
  underlying_view_definition text
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
    -- Since error_message is the first field, we can skip *most* of the nulls, but we need one so postgres knows this is a setof
    returnrec := ('Error creating temporary view: ' || v_error_message || ' sql: ' || sql_query, null);
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
      c.is_nullable as is_underlying_nullable,
      c.data_type as underlying_data_type,
      pg_get_viewdef(v_tmp_name) as formatted_query,
      underlying_table.table_type as underlying_table_type,
      case
        when
          underlying_table.table_type = 'VIEW'
          and underlying_table.table_schema != 'information_schema' -- important: information_schema views are weird and don't have non-nullable columns anyway, so don't try to analyze them
          and left(underlying_table.table_name, 3) != 'pg_' -- don't try to analyze pg_catalog views
        then
          pg_get_viewdef(underlying_table.table_name)
        else
          null
      end as underlying_view_definition
    from
      information_schema.columns c
    join
      information_schema.view_column_usage
        on c.table_name = view_column_usage.table_name
        and c.column_name = view_column_usage.column_name
        and c.table_schema = view_column_usage.table_schema
      join
        information_schema.tables underlying_table
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
  returnrec := ('Error in analyze_select_statement_columns: ' || v_error_message || ' sql: ' || sql_query, null);
  return next returnrec;
end;
$$
language plpgsql;
    `
      // for ease of debugging/copy-paste, replace the type names with fully qualified names after defining a big valid SQL statement that can be copied into raw SQL runner tool
      .replaceAll('types_type', `${schemaName}.types_type`)
      .replaceAll('analyze_select_statement_columns', `${schemaName}.analyze_select_statement_columns`),
  )
  await queryable.query(query)
}

export declare namespace queries {
  // Generated by @pgkit/typegen

  /** - query: `select prosrc, proargnames, proargmodes:... [truncated] ...lanname = 'sql' and proname = $1 limit 2` */
  export interface FunctionDefinition {
    /** regtype: `text` */
    prosrc: string | null

    /** regtype: `text[]` */
    proargnames: string[] | null

    /** regtype: `text[]` */
    proargmodes: string[] | null
  }
}

async function insertPrerequisites(
  tx: Transactable,
  schemaName: string,
  analyzed: SelectStatementAnalyzedColumn[],
  statement: ModifiedAST['ast'],
  options: {
    tableAlias: string
    source: string
  },
) {
  // if (analyzed.length === 0) throw new Error('Expected at least one analyzed column' + modifiedAST.originalSql)
  const tableAlias = {name: options.tableAlias}
  const aliasInfoList = getAliasInfo(statement)
  const aliasList = analyzed[0]?.column_aliases || []

  if (statement.type !== 'select') throw new Error(`Expected a select statement, got ${statement.type}`)
  const tempTableColumns = (statement.columns || []).flatMap(col => {
    // todo: helper to get a column name - need to follow postgres's rules like use table column name if no alias, use function name if no table column name, etc.
    const aliasName =
      col.alias?.name ||
      (col.expr.type === 'ref' ? col.expr.name : col.expr.type === 'call' ? col.expr.function.name : null)

    const aliasInfo = aliasInfoList.find(info => info.queryColumn === aliasName)
    if (!aliasInfo) {
      console.dir({aliasName, statement, aliasInfoList}, {depth: null})
      return []
      throw new Error(`Alias ${aliasName} not found in statement`, {})
    }

    const analyzedResult = analyzed.find(a => a.table_column_name === aliasInfo.aliasFor)
    if (!analyzedResult) {
      console.warn(`Alias ${aliasName} not found in analyzed results`, {aliasInfo, analyzed})
      return []
    }
    if (!analyzedResult) throw new Error(`Alias ${aliasName} not found in analyzed results`)

    const def = `${aliasName} ${analyzedResult.underlying_data_type} ${analyzedResult.is_underlying_nullable === 'NO' ? 'not null' : ''}`

    const comment = `From ${options.source} "${tableAlias.name}", column source: ${analyzedResult.schema_name}.${analyzedResult.underlying_table_name}.${analyzedResult.table_column_name}`
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
  if (analyzed.length === 0) {
    console.warn('inserting empty table', raw, analyzed, JSON.stringify(statement, null, 2))
  }
  await tx.query(raw)
}
