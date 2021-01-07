import {sql} from 'slonik'

export default [
  sql<queries.TestTable>`select * from test_schema_1.test_table`,
  sql<queries.TestTable_0>`select * from test_schema_2.test_table`,
]

module queries {
  /** - query: `select * from test_schema_1.test_table` */
  export interface TestTable {
    /**
     * This is a comment for test_schema_1.test_table.id
     *
     * column: `test_schema_1.test_table.id`, not null: `true`, postgres type: `integer`
     */
    id: number
  }

  /** - query: `select * from test_schema_2.test_table` */
  export interface TestTable_0 {
    /**
     * This is a comment for test_schema_2.test_table.id
     *
     * column: `test_schema_2.test_table.id`, postgres type: `integer`
     */
    id: number | null
  }
}
