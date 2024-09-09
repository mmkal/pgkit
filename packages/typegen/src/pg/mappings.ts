import {sql} from '@pgkit/client'
import * as lodash from 'lodash'
import {memoizeQueryFn} from '../utils/memoize'

// todo: use schemainspect
export const getEnumTypes = memoizeQueryFn(async pool => {
  const types = await pool.any(sql<queries.Type>`
    select distinct
      e.enumtypid,
      t.typname,
      e.enumlabel,
      t.typnamespace::regnamespace::text as schema_name,
      e.enumsortorder,
      t.typnamespace::regnamespace::text = any(current_schemas(true)) as in_search_path,
      case
        when t.typnamespace::regnamespace::text = any(current_schemas(false))
          then quote_ident(t.typname)
        else
          quote_ident(t.typnamespace::regnamespace::text) || '.' || quote_ident(t.typname)
      end as searchable_type_name
    from
      pg_enum as e
    join
      pg_type as t
    on
      t.oid = e.enumtypid
    order by
      t.typnamespace::regnamespace::text,
      t.typname,
      e.enumsortorder
  `)
  return lodash.groupBy(types, t => t.searchable_type_name)
})

/** postgres stores types in a pg_type table, and uses its own custom names for types under the `typname` column. this maps from regtype to the `pg_type.typname` value which you might sometimes need. */
export const getRegtypeToPgTypnameMapping = memoizeQueryFn(async pool => {
  const types = await pool.any(sql<queries.PgType>`
    select oid, typname, oid::regtype as regtype
    from pg_type
    where oid is not null
  `)

  return lodash.keyBy(types, t => t.regtype!)
})

/**
 * Global mappings from postgres type => typescript, in the absence of any field transformers.
 * List of postgres types: https://www.postgresql.org/docs/9.5/datatype.html
 */
export const defaultPGDataTypeToTypeScriptMappings: Record<string, string> = {
  bigint: 'number',
  bit: 'number',
  boolean: 'boolean',
  cidr: 'string',
  character: 'string',
  'character varying': 'string',
  'double precision': 'number',
  integer: 'number',
  interval: 'number',
  money: 'string',
  name: 'string',
  oid: 'number',
  real: 'number',
  regtype: 'string',
  smallint: 'number',
  text: 'string',
  'time with time zone': 'string',
  'time without time zone': 'string',
  'timestamp with time zone': 'string',
  'timestamp without time zone': 'string',
  uuid: 'string',
  void: 'void',
}

// todo: map from alias and/or oid to "regtype" which is what the above are
// https://www.postgresql-archive.org/OID-of-type-by-name-td3297240.html

export declare namespace queries {
  // Generated by @pgkit/typegen

  /** - query: `select distinct e.enumtypid, t.typname, ... [truncated] ...espace::text, t.typname, e.enumsortorder` */
  export interface Type {
    /** regtype: `oid` */
    enumtypid: number | null

    /** regtype: `name` */
    typname: string | null

    /** regtype: `name` */
    enumlabel: string | null

    /** regtype: `text` */
    schema_name: string | null

    /** regtype: `real` */
    enumsortorder: number | null

    /** regtype: `boolean` */
    in_search_path: boolean | null

    /** regtype: `text` */
    searchable_type_name: string | null
  }

  /** - query: `select oid, typname, oid::regtype as regtype from pg_type` */
  export interface PgType {
    /** regtype: `oid` */
    oid: number | null

    /** regtype: `name` */
    typname: string | null

    /** regtype: `regtype` */
    regtype: string | null
  }
}
