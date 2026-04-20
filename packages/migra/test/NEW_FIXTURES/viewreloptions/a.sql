create table test_table(id serial primary key, name text);

create table test_table_with_options(id serial primary key, name text) with (fillfactor = 80);

create view test_view_without_options as select name from test_table;

create view test_view_with_options with (security_barrier = true) as select name from test_table;

create materialized view test_matview_without_options as select name from test_table;

create materialized view test_matview_with_options with (fillfactor = 90, autovacuum_enabled = false) as select name from test_table;

