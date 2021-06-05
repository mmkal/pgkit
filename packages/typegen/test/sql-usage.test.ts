import * as sqlWithParameters from './fixtures/sql.test.ts/sql-with-parameters/__sql__/test-table.sql'

import {expectTypeOf} from 'expect-type'
import {getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table test_table(a int not null, b text);

    insert into test_table(a, b) values (1, 'one');
    insert into test_table(a, b) values (2, 'two');
  `)
})

// note: this test file will fail to even compile before sql.test.ts has run.

test('sql with parameters', async () => {
  const testTableQuery = sqlWithParameters.getTestTableQuerySync({
    params: {$1: 1, $2: 'one'},
  })

  expect(await helper.pool.any(testTableQuery)).toMatchInlineSnapshot(`
    Array [
      Object {
        "a": 1,
        "b": "one",
      },
    ]
  `)
})

test('sql with via async file reader', async () => {
  const testTableQuery = await sqlWithParameters.getTestTableQueryAsync({
    params: {$1: 1, $2: 'one'},
  })

  expect(await helper.pool.any(testTableQuery)).toMatchInlineSnapshot(`
    Array [
      Object {
        "a": 1,
        "b": "one",
      },
    ]
  `)
})

test('parameter type checking', async () => {
  expectTypeOf(sqlWithParameters.getTestTableQuerySync).parameter(0).toMatchTypeOf<{
    params: {$1: number; $2: string}
  }>()

  expectTypeOf(sqlWithParameters.getTestTableQueryAsync).parameter(0).toMatchTypeOf<{
    params: {$1: number; $2: string}
  }>()

  sqlWithParameters.getTestTableQuerySync({
    // @ts-expect-error generated SQL should be strict about the parameter types
    params: {$1: 'notanumber', $2: 'one'},
  })

  await sqlWithParameters.getTestTableQueryAsync({
    // @ts-expect-error generated SQL should be strict about the parameter types
    params: {$1: 'notanumber', $2: 'one'},
  })
})
