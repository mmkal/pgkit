with information_schema_table_constraints as (
select
    nc.nspname::information_schema.sql_identifier AS constraint_schema,
    c.conname::information_schema.sql_identifier AS constraint_name,
    nr.nspname::information_schema.sql_identifier AS table_schema,
    r.relname::information_schema.sql_identifier AS table_name,
    CASE c.contype
        WHEN 'c'::"char" THEN 'CHECK'::text
        WHEN 'f'::"char" THEN 'FOREIGN KEY'::text
        WHEN 'p'::"char" THEN 'PRIMARY KEY'::text
        WHEN 'u'::"char" THEN 'UNIQUE'::text
        ELSE NULL::text
    END::information_schema.character_data AS constraint_type,
    CASE
        WHEN c.condeferrable THEN 'YES'::text
        ELSE 'NO'::text
    END::information_schema.yes_or_no AS is_deferrable,
    CASE
        WHEN c.condeferred THEN 'YES'::text
        ELSE 'NO'::text
    END::information_schema.yes_or_no AS initially_deferred,
    'YES'::character varying::information_schema.yes_or_no AS enforced
   FROM pg_namespace nc,
    pg_namespace nr,
    pg_constraint c,
    pg_class r
  WHERE nc.oid = c.connamespace AND nr.oid = r.relnamespace AND c.conrelid = r.oid AND (c.contype <> ALL (ARRAY['t'::"char", 'x'::"char"])) AND (r.relkind = ANY (ARRAY['r'::"char", 'p'::"char"])) AND NOT pg_is_other_temp_schema(nr.oid) AND (pg_has_role(r.relowner, 'USAGE'::text) OR has_table_privilege(r.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'::text) OR has_any_column_privilege(r.oid, 'SELECT, INSERT, UPDATE, REFERENCES'::text))
UNION ALL
 SELECT
    nr.nspname::information_schema.sql_identifier AS constraint_schema,
    (((((nr.oid::text || '_'::text) || r.oid::text) || '_'::text) || a.attnum::text) || '_not_null'::text)::information_schema.sql_identifier AS constraint_name,
    nr.nspname::information_schema.sql_identifier AS table_schema,
    r.relname::information_schema.sql_identifier AS table_name,
    'CHECK'::character varying::information_schema.character_data AS constraint_type,
    'NO'::character varying::information_schema.yes_or_no AS is_deferrable,
    'NO'::character varying::information_schema.yes_or_no AS initially_deferred,
    'YES'::character varying::information_schema.yes_or_no AS enforced
   FROM pg_namespace nr,
    pg_class r,
    pg_attribute a
  WHERE nr.oid = r.relnamespace AND r.oid = a.attrelid AND a.attnotnull AND a.attnum > 0 AND NOT a.attisdropped AND (r.relkind = ANY (ARRAY['r'::"char", 'p'::"char"])) AND NOT pg_is_other_temp_schema(nr.oid) AND (pg_has_role(r.relowner, 'USAGE'::text) OR has_table_privilege(r.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'::text) OR has_any_column_privilege(r.oid, 'SELECT, INSERT, UPDATE, REFERENCES'::text))
),
extension_oids as (
  select
      objid
  from
      pg_depend d
  WHERE
      d.refclassid = 'pg_extension'::regclass
      and d.classid = 'pg_constraint'::regclass
), extension_rels as (
  select
      objid
  from
      pg_depend d
  WHERE
      d.refclassid = 'pg_extension'::regclass
      and d.classid = 'pg_class'::regclass
), indexes as (
    select
        schemaname as schema,
        tablename as table_name,
        indexname as name,
        indexdef as definition,
        indexdef as create_statement
    FROM
        pg_indexes
        -- SKIP_INTERNAL where schemaname not in ('pg_catalog', 'information_schema', 'pg_toast')
		-- SKIP_INTERNAL and schemaname not like 'pg_temp_%' and schemaname not like 'pg_toast_temp_%'
    order by
        schemaname, tablename, indexname
)
select
    nspname as schema,
    conname as name,
    relname as table_name,
    pg_get_constraintdef(pg_constraint.oid) as definition,
    case contype
        when 'c' then 'CHECK'
        when 'f' then 'FOREIGN KEY'
        when 'p' then 'PRIMARY KEY'
        when 'u' then 'UNIQUE'
        when 'x' then 'EXCLUDE'
    end as constraint_type,
    i.name as index,
    e.objid as extension_oid,
    case when contype = 'f' then
        (
            SELECT nspname
            FROM pg_catalog.pg_class AS c
            JOIN pg_catalog.pg_namespace AS ns
            ON c.relnamespace = ns.oid
            WHERE c.oid = confrelid::regclass
        )
    end as foreign_table_schema,
    case when contype = 'f' then
        (
            select relname
            from pg_catalog.pg_class c
            where c.oid = confrelid::regclass
        )
    end as foreign_table_name,
    case when contype = 'f' then
        (
            select
                array_agg(ta.attname order by c.rn)
            from
            pg_attribute ta
            join unnest(conkey) with ordinality c(cn, rn)

            on
                ta.attrelid = conrelid and ta.attnum = c.cn
        )
    else null end as fk_columns_local,
    case when contype = 'f' then
        (
            select
                array_agg(ta.attname order by c.rn)
            from
            pg_attribute ta
            join unnest(confkey) with ordinality c(cn, rn)

            on
                ta.attrelid = confrelid and ta.attnum = c.cn
        )
    else null end as fk_columns_foreign,
    contype = 'f' as is_fk,
    condeferrable as is_deferrable,
    condeferred as initially_deferred
from
    pg_constraint
    INNER JOIN pg_class
        ON conrelid=pg_class.oid
    INNER JOIN pg_namespace
        ON pg_namespace.oid=pg_class.relnamespace
    left outer join indexes i
        on nspname = i.schema
        and conname = i.name
        and relname = i.table_name
    left outer join extension_oids e
      on pg_class.oid = e.objid
    left outer join extension_rels er
      on er.objid = conrelid
    left outer join extension_rels cr
      on cr.objid = confrelid
    where contype in ('c', 'f', 'p', 'u', 'x')
  -- SKIP_INTERNAL and nspname not in ('pg_internal', 'pg_catalog', 'information_schema', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1')
  -- SKIP_INTERNAL and e.objid is null and er.objid is null and cr.objid is null
order by 1, 3, 2;
