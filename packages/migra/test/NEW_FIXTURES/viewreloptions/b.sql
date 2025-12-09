create table test_table(id serial primary key, name text);

-- Same table with different reloptions
create table test_table_with_options(id serial primary key, name text) with (fillfactor = 70, parallel_workers = 4);

-- Add a new table with reloptions
create table test_table_new_with_options(id serial primary key, name text) with (fillfactor = 75, autovacuum_enabled = false);

create view test_view_without_options as select name from test_table;

-- Same view with different reloptions
create view test_view_with_options with (security_barrier = false) as select name from test_table;

-- Add a new view with reloptions
create view test_view_new_with_options with (security_barrier = true) as select id from test_table;

create materialized view test_matview_without_options as select name from test_table;

-- Same materialized view with different reloptions
create materialized view test_matview_with_options with (fillfactor = 85, autovacuum_enabled = true) as select name from test_table;

-- Add a new materialized view with reloptions
create materialized view test_matview_new_with_options with (parallel_workers = 2) as select id from test_table;

