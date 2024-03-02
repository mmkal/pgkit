with extension_oids as (
      select
          objid
      from
          pg_depend d
      WHERE
          d.refclassid = 'pg_extension'::regclass
          and d.classid = 'pg_proc'::regclass
    ),
    pg_proc_pre as (
      select
        pp.*,
        -- 11_AND_LATER pp.oid as p_oid
        -- 10_AND_EARLIER pp.oid as p_oid, case when pp.proisagg then 'a' else 'f' end as prokind
      from pg_proc pp
    ),
routines as (
 SELECT current_database()::information_schema.sql_identifier AS specific_catalog,
    n.nspname::information_schema.sql_identifier AS specific_schema,
    --nameconcatoid(p.proname, p.oid)::information_schema.sql_identifier AS specific_name,
    current_database()::information_schema.sql_identifier AS routine_catalog,
    n.nspname::information_schema.sql_identifier AS schema,
    p.proname::information_schema.sql_identifier AS name,
        CASE p.prokind
            WHEN 'f'::"char" THEN 'FUNCTION'::text
            WHEN 'p'::"char" THEN 'PROCEDURE'::text
            ELSE NULL::text
        END::information_schema.character_data AS routine_type,
        CASE
            WHEN p.prokind = 'p'::"char" THEN NULL::text
            WHEN t.typelem <> 0::oid AND t.typlen = '-1'::integer THEN 'ARRAY'::text
            WHEN nt.nspname = 'pg_catalog'::name THEN format_type(t.oid, NULL::integer)
            ELSE 'USER-DEFINED'::text
        END::information_schema.character_data AS data_type,

        CASE
            WHEN nt.nspname IS NOT NULL THEN current_database()
            ELSE NULL::name
        END::information_schema.sql_identifier AS type_udt_catalog,
    nt.nspname::information_schema.sql_identifier AS type_udt_schema,
    t.typname::information_schema.sql_identifier AS type_udt_name,
        CASE
            WHEN p.prokind <> 'p'::"char" THEN 0
            ELSE NULL::integer
        END::information_schema.sql_identifier AS dtd_identifier,
        CASE
            WHEN l.lanname = 'sql'::name THEN 'SQL'::text
            ELSE 'EXTERNAL'::text
        END::information_schema.character_data AS routine_body,
        CASE
            WHEN pg_has_role(p.proowner, 'USAGE'::text) THEN p.prosrc
            ELSE NULL::text
        END::information_schema.character_data AS definition,
        CASE
            WHEN l.lanname = 'c'::name THEN p.prosrc
            ELSE NULL::text
        END::information_schema.character_data AS external_name,
    upper(l.lanname::text)::information_schema.character_data AS external_language,
    'GENERAL'::character varying::information_schema.character_data AS parameter_style,
        CASE
            WHEN p.provolatile = 'i'::"char" THEN 'YES'::text
            ELSE 'NO'::text
        END::information_schema.yes_or_no AS is_deterministic,
    'MODIFIES'::character varying::information_schema.character_data AS sql_data_access,
        CASE
            WHEN p.prokind <> 'p'::"char" THEN
            CASE
                WHEN p.proisstrict THEN 'YES'::text
                ELSE 'NO'::text
            END
            ELSE NULL::text
        END::information_schema.yes_or_no AS is_null_call,
    'YES'::character varying::information_schema.yes_or_no AS schema_level_routine,
    0::information_schema.cardinal_number AS max_dynamic_result_sets,
        CASE
            WHEN p.prosecdef THEN 'DEFINER'::text
            ELSE 'INVOKER'::text
        END::information_schema.character_data AS security_type,
    'NO'::character varying::information_schema.yes_or_no AS as_locator,
    'NO'::character varying::information_schema.yes_or_no AS is_udt_dependent,
    p.p_oid as oid,
    p.proisstrict,
    p.prosecdef,
    p.provolatile,
    p.proargtypes,
    p.proallargtypes,
    p.proargnames,
    p.proargdefaults,
    p.proargmodes,
    p.proowner,
    p.prokind as kind
   FROM pg_namespace n
     JOIN pg_proc_pre p ON n.oid = p.pronamespace
     JOIN pg_language l ON p.prolang = l.oid
     LEFT JOIN (pg_type t
     JOIN pg_namespace nt ON t.typnamespace = nt.oid) ON p.prorettype = t.oid AND p.prokind <> 'p'::"char"
  WHERE pg_has_role(p.proowner, 'USAGE'::text) OR has_function_privilege(p.p_oid, 'EXECUTE'::text)

),
    pgproc as (
      select
        schema,
        name,
        p.oid as oid,
        e.objid as extension_oid,
        case proisstrict when true then
          'RETURNS NULL ON NULL INPUT'
        else
          'CALLED ON NULL INPUT'
        end as strictness,
        case prosecdef when true then
          'SECURITY DEFINER'
        else
          'SECURITY INVOKER'
        end as security_type,
        case provolatile
          when 'i' then
            'IMMUTABLE'
          when 's' then
            'STABLE'
          when 'v' then
            'VOLATILE'
          else
            null
        end as volatility,
        p.proargtypes,
        p.proallargtypes,
        p.proargnames,
        p.proargdefaults,
        p.proargmodes,
        p.proowner,
        COALESCE(p.proallargtypes, p.proargtypes::oid[]) as procombinedargtypes,
        p.kind,
        p.type_udt_schema,
        p.type_udt_name,
        p.definition,
        p.external_language

      from
          routines p
          left outer join extension_oids e
            on p.oid = e.objid
      where true
      -- 11_AND_LATER and p.kind != 'a'
      -- SKIP_INTERNAL and schema not in ('pg_internal', 'pg_catalog', 'information_schema', 'pg_toast')
      -- SKIP_INTERNAL and schema not like 'pg_temp_%' and schema not like 'pg_toast_temp_%'
      -- SKIP_INTERNAL and e.objid is null
      -- SKIP_INTERNAL and p.external_language not in ('C', 'INTERNAL')
    ),
unnested as (
    select
        p.*,
        pname as parameter_name,
        pnum as position_number,
        CASE
            WHEN pargmode IS NULL THEN null
            WHEN pargmode = 'i'::"char" THEN 'IN'::text
            WHEN pargmode = 'o'::"char" THEN 'OUT'::text
            WHEN pargmode = 'b'::"char" THEN 'INOUT'::text
            WHEN pargmode = 'v'::"char" THEN 'IN'::text
            WHEN pargmode = 't'::"char" THEN 'OUT'::text
            ELSE NULL::text
            END::information_schema.character_data AS parameter_mode,
      CASE
        WHEN t.typelem <> 0::oid AND t.typlen = '-1'::integer THEN 'ARRAY'::text
        else format_type(t.oid, NULL::integer)

    END::information_schema.character_data AS data_type,
    CASE
            WHEN pg_has_role(p.proowner, 'USAGE'::text) THEN pg_get_function_arg_default(p.oid, pnum::int)
            ELSE NULL::text
        END::varchar AS parameter_default
    from pgproc p
    left join lateral
    unnest(
        p.proargnames,
        p.proallargtypes,
        p.procombinedargtypes,
        p.proargmodes)
    WITH ORDINALITY AS uu(pname, pdatatype, pargtype, pargmode, pnum) ON TRUE
    left join pg_type t
        on t.oid = uu.pargtype
),
    pre as (
        SELECT
            p.schema as schema,
            p.name as name,
            case when p.data_type = 'USER-DEFINED' then
              '"' || p.type_udt_schema || '"."' || p.type_udt_name || '"'
            else
              p.data_type
            end as returntype,
            p.data_type = 'USER-DEFINED' as has_user_defined_returntype,
            p.parameter_name as parameter_name,
            p.data_type as data_type,
            p.parameter_mode as parameter_mode,
            p.parameter_default as parameter_default,
            p.position_number as position_number,
            p.definition as definition,
            pg_get_functiondef(p.oid) as full_definition,
            p.external_language as language,
            p.strictness as strictness,
            p.security_type as security_type,
            p.volatility as volatility,
            p.kind as kind,
            p.oid as oid,
            p.extension_oid as extension_oid,
            pg_get_function_result(p.oid) as result_string,
            pg_get_function_identity_arguments(p.oid) as identity_arguments,
            pg_catalog.obj_description(p.oid) as comment
        FROM
          unnested p
    )
select
*
from pre
order by
    schema, name, parameter_mode, position_number, parameter_name;
