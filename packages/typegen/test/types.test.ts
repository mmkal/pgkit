import * as fs from 'fs'
import * as path from 'path'
import * as gdesc from '../src/gdesc'
import {getHelper} from './helper'
import {sql} from 'slonik'
import {expectTypeOf} from 'expect-type'

export const {gdescParams, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table test_table(foo int not null, bar text);

    insert into test_table(foo, bar) values (1, 'a')
  `)
})

test('types are correct', async () => {
  // This test is terrifyingly meta. It modifies its own source code, then verifies the modified code is correct.
  // To be sure it's verifying the right thing, it ensures that the modification has already been done. - i.e. running
  // codegen has no effect. This means it necesssarily has to fail the very first time it's run.
  const thisTestFileBeforeRunning = fs.readFileSync(__filename).toString()

  await gdesc.gdescriber({
    ...gdescParams(__dirname),
    glob: path.basename(__filename), // match only this file
  })

  const thisTestFileAfterRunning = fs.readFileSync(__filename).toString()

  expect(thisTestFileAfterRunning).toEqual(thisTestFileBeforeRunning)

  const results = await helper.pool.query(sql<queries.TestTable>`select * from test_table`)

  expect(results.rows).toHaveLength(1)
  expect(results.rows).toEqual([{foo: 1, bar: 'a'}])

  expectTypeOf(results.rows).items.toEqualTypeOf<{foo: number; bar: string | null}>()
})

module queries {
  /** - query: `select * from test_table` */
  export interface TestTable {
    /** column: `types_test.test_table.foo`, not null: `true`, postgres type: `integer` */
    foo: number

    /** postgres type: `text` */
    bar: string | null
  }
}
