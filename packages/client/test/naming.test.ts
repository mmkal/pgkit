import {expect, test} from 'vitest'
import {nickname} from '../src/naming'

expect.addSnapshotSerializer({
  test: Boolean,
  print: val => JSON.stringify(val, null, 2),
})

test('nickname', async () => {
  expect(nickname('select id, name from usr')).toMatchInlineSnapshot(`"select-usr"`)

  expect(nickname('select id, name from "User"')).toMatchInlineSnapshot(`"select-User"`)

  expect(
    nickname('select id, name from usr join usr_info on usr.id = usr_info.usr_id where id != 1'),
  ).toMatchInlineSnapshot(`"select-usr-usr_info"`)

  expect(nickname(`insert into foo (id, name) values (1, 'one')`)).toMatchInlineSnapshot(`"insert-foo"`)

  expect(nickname(`update foo set a = 'b'`)).toMatchInlineSnapshot(`"update-foo-set-a"`)

  expect(nickname(`delete from foo where a = 'b'`)).toMatchInlineSnapshot(`"delete-from-foo"`)

  expect(nickname(`alter table foo add column a int`)).toMatchInlineSnapshot(`"alter_table-foo-add_column-a"`)

  expect(
    nickname(
      `
        create table test_table(id int, name text);
        create index test_table_idx on test_table(name);
      `,
    ),
  ).toMatchInlineSnapshot(`"create_table-test_table"`)

  expect(
    // make sure nickname doesn't go too long
    nickname(`
      with foobarbaz123456789 as (select 1)
      select *
      from qwertyuiop123456789
      join asdfghjkl123456789 on a = b
      join zxcvbnm123456789 on c = d
      join foobarbaz123456789 on e = f
    `),
  ).toMatchInlineSnapshot(`"with-foobarbaz123456789-select-qwertyuiop123456789"`)

  expect(
    // ridiculous names won't get a useful nickname at all, just a keyword
    nickname(
      `select * from qwertyuiopasdfghjklzxcvbnm1234567890qwertyuiopasdfghjklzxcvbnm1234567890qwertyuiopasdfghjklzxcvbnm1234567890`,
    ),
  ).toMatchInlineSnapshot(`"select"`)

  expect(
    nickname(
      `
        with one as (
            select * from foo where x = 1
        ), two as (
            select id from bar where y = 2
        ), three as (
            insert into baz (id) values (1)
            returning *
        )
        select * from one join three on one.id = three.id
      `,
    ),
  ).toMatchInlineSnapshot(`"with-one-two-three-select-one-three"`)
})
