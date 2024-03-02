with extension_oids as (
  select
      objid
  from
      pg_depend d
  WHERE
      d.refclassid = 'pg_extension'::regclass and
      d.classid = 'pg_type'::regclass
)

SELECT
  n.nspname AS schema,
  pg_catalog.format_type (t.oid, NULL) AS name,
  t.typname AS internal_name,
  CASE
    WHEN t.typrelid != 0
      THEN CAST ( 'tuple' AS pg_catalog.text )
    WHEN t.typlen < 0
      THEN CAST ( 'var' AS pg_catalog.text )
    ELSE CAST ( t.typlen AS pg_catalog.text )
  END AS size,
  -- pg_catalog.array_to_string (
  --   ARRAY(
  --     SELECT e.enumlabel
  --       FROM pg_catalog.pg_enum e
  --       WHERE e.enumtypid = t.oid
  --       ORDER BY e.oid ), E'\n'
  --   ) AS columns,
  pg_catalog.obj_description (t.oid, 'pg_type') AS description,
  (array_to_json(array(
    select
      jsonb_build_object('attribute', attname, 'type', a.typname)
    from pg_class
    join pg_attribute on (attrelid = pg_class.oid)
    join pg_type a on (atttypid = a.oid)
    where (pg_class.reltype = t.oid)
  ))) as columns
FROM
  pg_catalog.pg_type t
  LEFT JOIN pg_catalog.pg_namespace n
    ON n.oid = t.typnamespace
WHERE (
  t.typrelid = 0
  OR (
    SELECT c.relkind = 'c'
      FROM pg_catalog.pg_class c
      WHERE c.oid = t.typrelid
  )
)
AND NOT EXISTS (
  SELECT 1
    FROM pg_catalog.pg_type el
    WHERE el.oid = t.typelem
    AND el.typarray = t.oid
)
AND n.nspname <> 'pg_catalog'
AND n.nspname <> 'information_schema'
AND pg_catalog.pg_type_is_visible ( t.oid )
and t.typcategory = 'C'
and t.oid not in (select * from extension_oids)
ORDER BY 1, 2;
