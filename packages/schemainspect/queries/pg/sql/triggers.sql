with extension_oids as (
  select
      objid
  from
      pg_depend d
  WHERE
     d.refclassid = 'pg_extension'::regclass and
     d.classid = 'pg_trigger'::regclass
)
select
    tg.tgname "name",
    nsp.nspname "schema",
    cls.relname table_name,
    pg_get_triggerdef(tg.oid) full_definition,
    proc.proname proc_name,
    nspp.nspname proc_schema,
    tg.tgenabled enabled,
    tg.oid in (select * from extension_oids) as extension_owned
from pg_trigger tg
join pg_class cls on cls.oid = tg.tgrelid
join pg_namespace nsp on nsp.oid = cls.relnamespace
join pg_proc proc on proc.oid = tg.tgfoid
join pg_namespace nspp on nspp.oid = proc.pronamespace
where not tg.tgisinternal
-- SKIP_INTERNAL and not tg.oid in (select * from extension_oids)
order by schema, table_name, name;
