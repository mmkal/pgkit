import * as lodash from 'lodash'
import {globAsync} from './util'
import {PSQLClient, psqlClient} from './pg'
import * as defaults from './defaults'
import {GdescriberParams, QueryField, DescribedQuery} from './types'
import {getViewFriendlySql} from './parse'
import {sql, DatabasePoolType} from 'slonik'

export * from './types'
export * from './defaults'

// todo: logging
// todo: search for non-type-tagged queries and use a heuristic to guess a good name from them
// using either sql-surveyor or https://github.com/oguimbal/pgsql-ast-parser

export const nullablise = (pool: DatabasePoolType) => {
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
        console.log('\n\n\n\n', viewResult, {res, f})
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

export const gdescriber = (params: Partial<GdescriberParams> = {}) => {
  const {
    psqlCommand,
    gdescToTypeScript,
    rootDir,
    glob,
    defaultType,
    extractQueries,
    writeTypes,
    typeParsers,
    pool,
  } = defaults.getParams(params)
  const client = psqlClient(psqlCommand)
  const {psql, getEnumTypes, getRegtypeToPGType} = client

  const describeCommand = async (query: string): Promise<QueryField[]> => {
    const rows = await psql(`${query} \\gdesc`)
    const withoutColumns = await Promise.all(
      rows.map<Promise<QueryField>>(async row => ({
        name: row.Column,
        gdesc: row.Type,
        typescript: await getTypeScriptType(row.Type, row.Column),
        // column: {},
      })),
    )

    return Promise.all(
      withoutColumns.map<Promise<QueryField>>(async row => ({
        ...row,
        // column: {},
      })),
    )
  }

  const getTypeScriptType = async (regtype: string, typeName: string): Promise<string> => {
    if (!regtype) {
      return defaultType
    }

    const enumTypes = await getEnumTypes()
    const regtypeToPGType = await getRegtypeToPGType()

    if (regtype?.endsWith('[]')) {
      return `Array<${getTypeScriptType(regtype.slice(0, -2), typeName)}>`
    }

    if (regtype?.match(/\(\d+\)/)) {
      return getTypeScriptType(regtype.split('(')[0], typeName)
    }

    const pgtype = regtypeToPGType[regtype]?.typname

    return (
      lodash.findLast(typeParsers, p => p.name === pgtype)?.typescript ||
      gdescToTypeScript(regtype, typeName) ||
      defaults.defaultPGDataTypeToTypeScriptMappings[regtype] ||
      enumTypes[regtype]?.map(t => JSON.stringify(t.enumlabel)).join(' | ') ||
      defaultType
    )
  }

  const findAll = async () => {
    const n = nullablise(pool)

    const globParams: Parameters<typeof globAsync> = typeof glob === 'string' ? [glob, {}] : glob
    const files = await globAsync(globParams[0], {...globParams[1], cwd: rootDir, absolute: true})
    const promises = files.flatMap(extractQueries).map<Promise<DescribedQuery>>(async query => {
      const described: DescribedQuery = {
        ...query,
        fields: await describeCommand(query.sql || query.template.map((s, i) => (i === 0 ? s : `$${i}${s}`)).join('')),
      }

      return n(described)
    })

    const queries = lodash.groupBy(await Promise.all(promises), q => q.tag)

    writeTypes(queries)
  }

  return findAll()
}
