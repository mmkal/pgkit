create table a(id int primary key not null);

create table b(id int primary key not null);

create table ab (
    id int primary key not null,
    a_id int NOT NULL,
    b_id int NOT NULL
);

create unique index ab_a_id_b_id on ab (a_id, b_id);
