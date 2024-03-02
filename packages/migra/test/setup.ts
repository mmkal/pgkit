import {createPool, sql} from '@pgkit/client'
import {expect, test} from 'vitest'

test('create schemas', async () => {
  const poola = createPool('postgresql://postgres:postgres@localhost:5432/postgres')
  const poolb = createPool('postgresql://postgres:postgres@localhost:5433/postgres')
  await poola.query(sql`
    drop schema if exists migra_test_schema cascade;
    create schema migra_test_schema;

    create table if not exists migra_test_schema.test_table_1 (id int not null, name text);
    create table if not exists migra_test_schema.test_table_2 (slug text);
  `)

  const tablesQuery = sql`
    select table_name
    from information_schema.tables
    where table_schema = 'migra_test_schema'
    order by table_name asc;
  `

  await poolb.query(sql`
    drop schema if exists migra_test_schema cascade;
    create schema migra_test_schema;
    create table if not exists migra_test_schema.test_table_1 (id int);
  `)

  expect(await poola.anyFirst(tablesQuery)).toMatchInlineSnapshot(`
    [
      "test_table_1",
      "test_table_2",
    ]
  `)
  expect(await poolb.anyFirst(tablesQuery)).toMatchInlineSnapshot(`
    [
      "test_table_1",
    ]
  `)
})
