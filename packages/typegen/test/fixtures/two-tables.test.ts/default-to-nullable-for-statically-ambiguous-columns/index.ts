import {sql} from 'slonik'

export default sql<queries.TestTable1_TestTable2>`
  select a, b
  from test_table_1
  join test_table_2
  on a = b
`

module queries {
  /** - query: `select a, b from test_table_1 join test_table_2 on a = b` */
  export interface TestTable1_TestTable2 {
    /** column: `two_tables_test.test_table_1.a`, not null: `true`, postgres type: `integer` */
    a: number

    /** column: `two_tables_test.test_table_2.b`, not null: `true`, postgres type: `integer` */
    b: number
  }
}
