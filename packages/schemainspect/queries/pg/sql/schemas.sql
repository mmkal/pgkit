with extension_oids as (
  select
      objid
  from
      pg_depend d
  WHERE
      d.refclassid = 'pg_extension'::regclass
      and d.classid = 'pg_namespace'::regclass
) select
    nspname as schema
from
    pg_catalog.pg_namespace
    left outer join extension_oids e
    	on e.objid = oid
-- SKIP_INTERNAL where nspname not in ('pg_internal', 'pg_catalog', 'information_schema', 'pg_toast')
-- SKIP_INTERNAL and nspname not like 'pg_temp_%' and nspname not like 'pg_toast_temp_%'
-- SKIP_INTERNAL and e.objid is null
order by 1;
