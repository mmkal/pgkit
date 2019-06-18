create table messages(
  id serial primary key,
  content varchar(20),
  created_at timestamptz not null default now()
);
