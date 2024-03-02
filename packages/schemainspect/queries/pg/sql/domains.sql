with extension_oids as (
  select
      objid
  from
      pg_depend d
  WHERE
      d.refclassid = 'pg_extension'::regclass and
      d.classid = 'pg_type'::regclass
)
SELECT n.nspname as "schema",
       t.typname as "name",
       pg_catalog.format_type(t.typbasetype, t.typtypmod) as "data_type",
       (SELECT c.collname FROM pg_catalog.pg_collation c, pg_catalog.pg_type bt
        WHERE c.oid = t.typcollation AND bt.oid = t.typbasetype AND t.typcollation <> bt.typcollation) as "collation",
        rr.conname as "constraint_name",
       t.typnotnull as "not_null",
       t.typdefault as "default",
       pg_catalog.array_to_string(ARRAY(
         SELECT pg_catalog.pg_get_constraintdef(r.oid, true) FROM pg_catalog.pg_constraint r WHERE t.oid = r.contypid
       ), ' ') as "check"
FROM pg_catalog.pg_type t
     LEFT JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
     left join pg_catalog.pg_constraint rr on t.oid = rr.contypid
WHERE t.typtype = 'd'
      AND n.nspname <> 'pg_catalog'
      AND n.nspname <> 'information_schema'
  AND pg_catalog.pg_type_is_visible(t.oid)
  and t.oid not in (select * from extension_oids)
ORDER BY 1, 2;
