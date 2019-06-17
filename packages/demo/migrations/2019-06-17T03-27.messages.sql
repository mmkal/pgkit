create table messages(
  id serial primary key,
  content text,
  created_at timestamptz not null default now()
);
