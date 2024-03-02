create extension hstore;
create extension citext;

create schema goodschema;
create schema evenbetterschema;

create table goodschema.test_table (id int primary key, name text);
create table evenbetterschema.test_table (id int primary key, name text, another_column jsonb);

insert into goodschema.test_table (id, name) values (1, 'one'), (2, 'two');

insert into evenbetterschema.test_table (id, name, another_column) values
    (1, 'uno', '{"a": 1}'),
    (2, 'dos', '{"b": 2}'),
    (3, 'tres', '{"c": 3}');

CREATE TYPE shipping_status AS ENUM ('not shipped', 'shipped', 'delivered');

CREATE TYPE bug_status AS ENUM ('new', 'open', 'closed');

CREATE TYPE unused_enum AS ENUM ('a', 'b', 'c');

CREATE TYPE usage_dropped_enum AS ENUM ('x', 'y');

create table columnless_table2();

create table change_to_logged();

create unlogged table change_to_unlogged();

CREATE TABLE products (
    product_no serial primary key,
    name text,
    price numeric not null default 100,
    x integer,
    newcolumn text,
    newcolumn2 interval,
    constraint x check (price > 10),
    constraint y check (price > 0)
);

create index on products(name);

grant update, insert on table products to postgres;

CREATE TABLE orders (
    order_id integer primary key unique,
    shipping_address text,
    status shipping_status,
    status2 text,
    h hstore
);

CREATE TABLE order_items (
    product_no integer REFERENCES products ON DELETE RESTRICT,
    order_id integer REFERENCES orders ON DELETE CASCADE,
    quantity integer,
    PRIMARY KEY (product_no, order_id)
);

create or replace function public.changed(i integer, t text[])
returns TABLE(a text, c integer) as
$$
 declare
        BEGIN
                select 'no', 1;
        END;

$$
LANGUAGE PLPGSQL volatile returns null on null input security definer;

create or replace function public.newfunc(i integer, t text[])
returns TABLE(a text, c integer) as
$$
 declare
        BEGIN
                select 'no', 1;
        END;

$$
LANGUAGE PLPGSQL STABLE returns null on null input security invoker;

create view vvv as select 2 as a, 3 as b;

create materialized view matvvv as select 2 as a, 3 as b;

CREATE TABLE bug (
    id serial,
    description text,
    status text-- bug_status
);