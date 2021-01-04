import {sql} from 'slonik'

export default [
  // small number of queries here makes it easier to add log statements without tons of noise
  sql<queries.TestTable>`select id from test_table`,
  sql<queries.TestTable>`select t1.id from test_table t1 join test_table t2 on t1.id = t2.n`,
]

module queries {
  /**
   * queries:
   * - `select id from test_table`
   * - `select t1.id from test_table t1 join test_table t2 on t1.id = t2.n`
   */
  export interface TestTable {
    /** column: `gdesc_test.test_table.id`, not null: `true`, postgres type: `integer` */
    id: number
  }
}
