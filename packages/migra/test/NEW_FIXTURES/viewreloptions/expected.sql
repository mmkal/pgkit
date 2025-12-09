create sequence "public"."test_table_new_with_options_id_seq";

drop materialized view if exists "public"."test_matview_with_options";

create table "public"."test_table_new_with_options" (
    "id" integer not null default nextval('test_table_new_with_options_id_seq'::regclass),
    "name" text
) with (fillfactor = 75, autovacuum_enabled = false);

alter table "public"."test_table_with_options" set (fillfactor = 70, parallel_workers = 4);

alter sequence "public"."test_table_new_with_options_id_seq" owned by "public"."test_table_new_with_options"."id";

CREATE UNIQUE INDEX test_table_new_with_options_pkey ON public.test_table_new_with_options USING btree (id);

alter table "public"."test_table_new_with_options" add constraint "test_table_new_with_options_pkey" PRIMARY KEY using index "test_table_new_with_options_pkey";

create materialized view "public"."test_matview_new_with_options" with (parallel_workers = 2) as  SELECT test_table.id
   FROM test_table;

create or replace view "public"."test_view_new_with_options" with (security_barrier = true) as  SELECT test_table.id
   FROM test_table;

create materialized view "public"."test_matview_with_options" with (fillfactor = 85, autovacuum_enabled = true) as  SELECT test_table.name
   FROM test_table;

create or replace view "public"."test_view_with_options" with (security_barrier = false) as  SELECT test_table.name
   FROM test_table;

