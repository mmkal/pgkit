import * as assert from 'assert'
import {createHash} from 'crypto'

import * as lodash from 'lodash'
import {singular} from 'pluralize'
import {DatabasePool, sql} from 'slonik'

import {AnalysedQuery, AnalysedQueryField, DescribedQuery, QueryField} from '../types'
import {tryOrDefault} from '../util'
import * as parse from './index'
import {getHopefullyViewableAST, getSuggestedTags, isCTE, suggestedTags} from './parse'
import {getViewFriendlySql} from '.'

const _sql = sql

const getTypesSql = _sql`
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

export class AnalyseQueryError extends Error {
  public readonly [Symbol.toStringTag] = 'AnalyseQueryError'
  constructor(
    public readonly originalError: Error,
    public readonly query: DescribedQuery,
    public readonly recover?: AnalysedQuery,
  ) {
    super(`Error describing Query: ${originalError.message}`)
  }
}

// todo: logging
// todo: get table description from obj_description(oid) (like column)

export const columnInfoGetter = (pool: DatabasePool) => {
  // const createViewAnalyser = lodash.once(() => pool.query(getTypesSql))

  const addColumnInfo = async (query: DescribedQuery): Promise<AnalysedQuery> => {
    const cte = isCTE(query.template)
    const viewFriendlySql = getViewFriendlySql(query.template)
    const suggestedTags = tagsFromDescribedQuery(query)

    // await createViewAnalyser()

    const viewResultQuery = _sql<GetTypes>`
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

    const ast = getHopefullyViewableAST(viewFriendlySql)
    if (ast.type !== 'select') {
      return {
        ...query,
        suggestedTags,
        fields: query.fields.map(defaultAnalysedQueryField),
      }
    }

    const viewResult = cte
      ? [] // not smart enough to figure out what types are referenced via a CTE
      : await pool.transaction(async t => {
          await t.query(getTypesSql)
          const results = await t.any(viewResultQuery)
          return lodash.uniqBy(results, JSON.stringify)
        })

    const formattedSqlStatements = [...new Set(viewResult.map(r => r.formatted_query))]

    assert.ok(formattedSqlStatements.length <= 1, `Expected exactly 1 formatted sql, got ${formattedSqlStatements}`)

    const parseableSql = formattedSqlStatements[0] || viewFriendlySql

    const parsed = parse.getAliasMappings(parseableSql)

    return {
      ...query,
      suggestedTags,
      fields: query.fields.map(f => {
        const relatedResults = parsed.flatMap(c =>
          viewResult
            .map(v => ({
              ...v,
              hasNullableJoin: c.hasNullableJoin,
            }))
            .filter(v => {
              assert.ok(v.underlying_table_name, `Table name for ${JSON.stringify(c)} not found`)
              return (
                c.queryColumn === f.name &&
                c.tablesColumnCouldBeFrom.includes(v.underlying_table_name) &&
                c.aliasFor === v.table_column_name
              )
            }),
        )

        const res = relatedResults.length === 1 ? relatedResults[0] : undefined

        // determine nullability
        let nullability: AnalysedQueryField['nullability'] = 'unknown'
        if (res?.is_underlying_nullable === 'YES') {
          nullability = 'nullable'
        } else if (res?.hasNullableJoin) {
          nullability = 'nullable_via_join'
        } else if (res?.is_underlying_nullable === 'NO' || isNonNullableField(parseableSql, f)) {
          nullability = 'not_null'
        } else {
          nullability = 'unknown'
        }

        return {
          ...f,
          nullability,
          column: res && {
            schema: res.schema_name!,
            table: res.underlying_table_name!,
            name: res.table_column_name!,
          },
          comment: res?.comment || undefined,
        }
      }),
    }
  }

  return async (query: DescribedQuery): Promise<AnalysedQuery> =>
    addColumnInfo(query).catch(e => {
      const recover = {
        ...query,
        suggestedTags: tagsFromDescribedQuery(query),
        fields: query.fields.map(defaultAnalysedQueryField),
      }
      throw new AnalyseQueryError(e, query, recover)
    })
}

const tagOptions = (query: DescribedQuery) => {
  const sqlTags = tryOrDefault(() => getSuggestedTags(query.template), [])

  const codeContextTags = query.context
    .slice()
    .reverse()
    .map(item =>
      lodash
        .kebabCase(item)
        .split('-')
        .map(singular)
        .filter(part => !['query', 'result'].includes(part))
        .join('-'),
    )
    .map(lodash.flow(lodash.camelCase, lodash.upperFirst))
    .map((_, i, arr) => arr.slice(0, i + 1).join('_'))
    .filter(Boolean)

  const fieldTags = suggestedTags({
    tables: [],
    columns: query.fields.map(f => f.name),
  })

  const anonymousTags = ['Anonymous' + shortHexHash(query.sql)] // add hash to avoid `Anonymous` clashes

  return {sqlTags, codeContextTags, fieldTags, anonymousTags}
}

const tagsFromDescribedQuery = (query: DescribedQuery) => {
  const options = tagOptions(query)

  const tags = options.sqlTags.slice()
  tags.splice(tags[0]?.slice(1).includes('_') ? 0 : 1, 0, ...options.codeContextTags)
  tags.push(...options.fieldTags)
  tags.push(...options.codeContextTags)
  tags.push(...options.anonymousTags)

  return tags
}

const shortHexHash = (str: string) => createHash('md5').update(str).digest('hex').slice(0, 6)

export const defaultAnalysedQueryField = (f: QueryField): AnalysedQueryField => ({
  ...f,
  nullability: 'unknown',
  comment: undefined,
  column: undefined,
})

const nonNullableExpressionTypes = new Set([
  'integer',
  'numeric',
  'string',
  'boolean',
  'list',
  'array',
  'keyword',
  'parameter',
  'constant',
  'value',
  'values',
])
export const isNonNullableField = (sql: string, field: QueryField) => {
  const ast = getHopefullyViewableAST(sql)
  if (ast.type !== 'select' || !Array.isArray(ast.columns)) {
    return false
  }
  const nonNullableColumns = ast.columns.filter(c => {
    if (c.expr.type !== 'call') {
      return false
    }
    const name = c.alias?.name ?? c.expr.function.name
    if (field.name !== name) {
      return false
    }
    if (c.expr.function.name === 'count') {
      // `count` is the only aggregation function, which never returns null.
      return true
    }
    if (c.expr.function.name === 'coalesce') {
      // let's try to check the args for nullability - as soon as we encounter a definitive non-nullable one, the whole term becomes non-nullable.
      return c.expr.args.some(arg => {
        // for now we'll only check for static args, of which we're sure to be not null, and assume nullability for all others
        // to work for other types (i.e. refs or functions) this function needs to become recursive, which requires the change below
        // todo: centralise nullability checks in query parse routine
        const type = arg.type === 'cast' ? arg.operand.type : arg.type
        return nonNullableExpressionTypes.has(type)
      })
    }
    return false
  })
  // if there's exactly one column with the same name as the field and matching the conditions above, we can be confident it's not nullable.
  return nonNullableColumns.length === 1
}

// this query is for a type in a temp schema so this tool doesn't work with it
export interface GetTypes {
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
