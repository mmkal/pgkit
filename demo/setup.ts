import {sql} from './db'

await sql`
    drop table if exists users;
    create table if not exists users(
        id serial primary key,
        email text not null,
        name text,
        email_verified boolean not null default false,
        created_at timestamp not null default now()
    );
    insert into users (email, name) values ('test@test.com', 'test');
`

const result = await sql`select * from users`

console.log(result)