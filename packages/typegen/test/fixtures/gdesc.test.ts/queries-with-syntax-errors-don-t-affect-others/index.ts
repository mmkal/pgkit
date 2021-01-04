import {sql} from 'slonik'

export default [
  sql<queries.TestTable>`select id from gdesc_test.test_table`, // this should get a valid type
  sql<queries.Anonymous>`this is a nonsense query which will cause an error`,
]

module queries {
  /** - query: `select id from gdesc_test.test_table` */
  export interface TestTable {
    /** column: `gdesc_test.test_table.id`, not null: `true`, postgres type: `integer` */
    id: number
  }

  /** - query: `this is a nonsense query which will cause an error` */
  export interface Anonymous {}
}
