import {sql} from 'slonik'

export const q = sql<queries.TestTable>`select id from test_table`

module queries {
  /** - query: `select id from test_table` */
  export interface TestTable {
    /** column: `gdesc_test.test_table.id`, not null: `true`, postgres type: `integer` */
    id: number
  }
}
