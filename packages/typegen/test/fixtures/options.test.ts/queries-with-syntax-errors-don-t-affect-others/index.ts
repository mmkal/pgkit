import {sql} from 'slonik'

export default [
  sql<queries.TestTable>`select id from options_test.test_table`, // this should get a valid type
  sql`this is a nonsense query which will cause an error`,
]

export declare namespace queries {
  /** - query: `select id from options_test.test_table` */
  export interface TestTable {
    /** column: `options_test.test_table.id`, not null: `true`, regtype: `integer` */
    id: number
  }
}
