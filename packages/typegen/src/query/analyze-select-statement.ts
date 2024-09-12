import {Queryable, sql} from '@pgkit/client'
import {z} from 'zod'

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

  // todo: consolidate this with underlying_data_type
  formatted_data_type: z.string().nullable(),
})

export type SelectStatementAnalyzedColumn = z.infer<typeof SelectStatementAnalyzedColumnSchema>

/**
 * A query, which creates a tmp table for the purpose of analysing types of another query
 */
export const createAnalyzeSelectStatementColumnsFunction = async (queryable: Queryable, schemaName: string) => {
  if (/\W/.test(schemaName)) throw new Error(`Invalid schema name ${schemaName}`)
  // todo: figure out why sql.identifier is giving syntax errors
  let query =
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
  underlying_view_definition text,
  formatted_data_type text
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
    raise notice 'Error creating temporary view. Message: %', v_error_message;
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
      underlying_column.column_name as table_column_name,
      view_column_usage.column_name as query_column_name,
      (
        select array_agg(attname) from (
          select attname from pg_attribute where attrelid = v_tmp_name::regclass order by attnum
        ) t
      ) as column_aliases,
      --'originally from table: ' || view_column_usage.table_name as comment,
      col_description(
        to_regclass(quote_ident(underlying_column.table_schema) || '.' || quote_ident(underlying_column.table_name)),
        underlying_column.ordinal_position
      ) as comment,
      view_column_usage.table_name as underlying_table_name,
      underlying_column.is_nullable as is_underlying_nullable,
      -- todo: probably remove in favour of formatted_data_type, I think this will just be "ARRAY" for boolean[] etc. The pg_attribute table gives a proper type.
      underlying_column.data_type as underlying_data_type,
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
      end as underlying_view_definition,
      pg_catalog.format_type(pg_attribute.atttypid, pg_attribute.atttypmod) as formatted_data_type
    from
      information_schema.view_column_usage
    join
      information_schema.columns underlying_column
        on underlying_column.table_name = view_column_usage.table_name
        and underlying_column.column_name = view_column_usage.column_name
        and underlying_column.table_schema = view_column_usage.table_schema
    join
      information_schema.tables underlying_table
        on underlying_column.table_name = underlying_table.table_name
        and underlying_column.table_schema = underlying_table.table_schema
    left join -- left join because we don't always have attributes for views
      pg_attribute
        on underlying_column.column_name = pg_attribute.attname
        and underlying_column.table_name in (
          select relname
          from pg_class
          where pg_class.oid = pg_attribute.attrelid
          and pg_class.relnamespace::regnamespace::text = underlying_column.table_schema
        )
    where
      underlying_column.table_name = v_tmp_name
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
  query = query // for ease of debugging/copy-paste, replace the type names with fully qualified names after defining a big valid SQL statement that can be copied into raw SQL runner tool
    .replaceAll('types_type', `${schemaName}.types_type`)
    .replaceAll('analyze_select_statement_columns', `${schemaName}.analyze_select_statement_columns`)

  await queryable.query(sql.raw(query))
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
