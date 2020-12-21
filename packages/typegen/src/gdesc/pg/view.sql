-- select format_sql('select 123')

drop type if exists types_type cascade;

create type types_type as (
	schema_name text,
	view_name text,
	column_name text,
	data_type text,
	max_length int,
	is_nullable text,
	underlying_table_name text,
	is_underlying_nullable text,
	formatted_query text
);

-- drop view temp2_a100361361eb4b83439fdc86ddcd1bbb;
-- drop view temp2_ed561d44779b6e70167b97545ccbdf6b;
-- drop view temp_ed561d44779b6e70167b97545ccbdf6b;

drop function if exists gettypes(text);

-- taken from https://dataedo.com/kb/query/postgresql/list-views-columns
-- and https://www.cybertec-postgresql.com/en/abusing-postgresql-as-an-sql-beautifier
-- nullable: https://stackoverflow.com/a/63980243
create or replace function gettypes(text)
returns setof types_type as
$$
declare
	v_tmp_name text;
	sql_query alias for $1;
	returnrec types_type;
	rec types_type;
begin
  v_tmp_name := 'temp2_' || md5(sql_query);
	execute 'drop view if exists ' || v_tmp_name;
  execute 'create view ' || v_tmp_name || ' as ' || sql_query;
  
  FOR returnrec in
  select
  	vcu.table_schema as schema_name,
	vcu.view_name as view_name,
	c.column_name,
	c.data_type,
	0 as max_length,
	c.is_nullable,
	vcu.table_name as underlying_table_name,
	c.is_nullable as is_underlying_nullable,
	pg_get_viewdef(v_tmp_name) as formatted_query
	
	from information_schema.view_column_usage vcu
	left join information_schema.columns c
		on c.table_name = vcu.table_name
		and c.column_name = vcu.column_name
	where
		vcu.view_name = v_tmp_name
	limit 6
--   select
--   	t.table_schema as schema_name,
-- 	t.table_name as view_name,
-- 	c.column_name,
-- 	c.data_type,
-- 	case when c.character_maximum_length is not null
-- 		then c.character_maximum_length
-- 		else c.numeric_precision end as max_length,
-- 	c.is_nullable,
-- 	vcu.table_name as underlying_table_name,
-- 	underlying_column.is_nullable as is_underlying_nullable,
-- 	pg_get_viewdef(v_tmp_name) as formatted_query
-- 	from information_schema.tables t
-- 	left join information_schema.columns c 
-- 		on t.table_schema = c.table_schema 
-- 		and t.table_name = c.table_name
-- 	left join information_schema.view_column_usage vcu
-- 		on vcu.view_name = c.table_name
-- 	left join information_schema.columns underlying_column
-- 		on underlying_column.column_name = vcu.column_name
-- 		and underlying_column.table_name = vcu.table_name
-- 		and underlying_column.table_schema = vcu.table_schema
-- 		and underlying_column.table_catalog = vcu.table_catalog
-- 	where
-- 		table_type = 'VIEW' 
-- 		and t.table_schema not in ('information_schema', 'pg_catalog')
-- 		and t.table_name = v_tmp_name
-- 	order by
-- 		schema_name,
-- 		view_name
	loop
		return next returnrec;
    end loop;

	execute 'drop view ' || v_tmp_name;

	RAISE NOTICE 'Calling cs_create_job(%)', v_tmp_name;

-- 	select 1, 2 into rec;
-- 	return rec;
end;
$$
LANGUAGE 'plpgsql';

-- select * from gettypes('select d.name, m.hash from demo_migration d join migration m on m.name = d.name limit 2');

-- select * from gettypes('select d.name, m.hash from demo_migration d join migration m on m.name = d.name limit 2');
drop table nn cascade;
create table nn(id int primary key, x int not null, t text, a text[], j json, jb jsonb);
select * from gettypes('select * from nn');
-- select * from information_schema.view_column_usage where view_name like 'temp2%' limit 10;
-- select * from information_schema.columns where column_name = 'is_nullable';
