with extension_oids as (
  select
      objid,
      classid::regclass::text as classid
  from
      pg_depend d
  WHERE
      d.refclassid = 'pg_extension'::regclass and
      d.classid = 'pg_index'::regclass
),
extension_relations as (
  select
      objid
  from
      pg_depend d
  WHERE
      d.refclassid = 'pg_extension'::regclass and
      d.classid = 'pg_class'::regclass
), pre as (
    SELECT n.nspname AS schema,
   c.relname AS table_name,
   i.relname AS name,
   i.oid as oid,
   e.objid as extension_oid,
   pg_get_indexdef(i.oid) AS definition,
       (
           select
               array_agg(attname order by ik.n)
           from
                unnest(x.indkey) with ordinality ik(i, n)
                join pg_attribute aa
                    on
                        aa.attrelid = x.indrelid
                        and ik.i = aa.attnum
        )
       index_columns,
       indoption key_options,
       indnatts total_column_count,
       -- 11_AND_LATER indnkeyatts key_column_count,
       -- 10_AND_EARLIER indnatts key_column_count,
       indnatts num_att,
        -- 11_AND_LATER indnatts - indnkeyatts included_column_count,
        -- 10_AND_EARLIER 0 included_column_count,
       indisunique is_unique,
       indisprimary is_pk,
       indisexclusion is_exclusion,
       indimmediate is_immediate,
       indisclustered is_clustered,
       indcollation key_collations,
       pg_get_expr(indexprs, indrelid) key_expressions,
       pg_get_expr(indpred, indrelid) partial_predicate,
       amname algorithm
  FROM pg_index x
    JOIN pg_class c ON c.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_am am ON i.relam = am.oid
    LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
     left join extension_oids e
      on i.oid = e.objid
    left join extension_relations er
      on c.oid = er.objid
WHERE
    x.indislive
    and c.relkind in ('r', 'm', 'p') AND i.relkind in ('i', 'I')
      -- SKIP_INTERNAL and nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
      -- SKIP_INTERNAL and nspname not like 'pg_temp_%' and nspname not like 'pg_toast_temp_%'
      -- SKIP_INTERNAL and e.objid is null and er.objid is null
)
select * ,
index_columns[1\:key_column_count] as key_columns,
index_columns[key_column_count+1\:array_length(index_columns, 1)] as included_columns
from pre
order by 1, 2, 3;
