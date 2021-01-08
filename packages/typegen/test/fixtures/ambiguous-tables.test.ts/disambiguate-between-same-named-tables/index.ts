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

    /** column: `test_schema_1.test_table.e`, postgres type: `test_schema_1.test_enum` */
    e: ('schema1_A' | 'schema1_B' | 'schema1_C') | null

    /** column: `test_schema_1.test_table.eee`, postgres type: `test_enum` */
    eee: ('default_schema_A' | 'default_schema_B' | 'default_schema_C') | null
  }

  /** - query: `select * from test_schema_2.test_table` */
  export interface TestTable_0 {
    /**
     * This is a comment for test_schema_2.test_table.id
     *
     * column: `test_schema_2.test_table.id`, postgres type: `integer`
     */
    id: number | null

    /** column: `test_schema_2.test_table.e`, postgres type: `test_schema_2.test_enum` */
    e: ('schema2_A' | 'schema2_B' | 'schema2_C') | null
  }
}
