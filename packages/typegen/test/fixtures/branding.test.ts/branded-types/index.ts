import {sql} from 'slonik'

export default sql<queries.TestTable>`select id, n from test_table`

export module queries {
  /** - query: `select id, n from test_table` */
  export interface TestTable {
    /** column: `branding_test.test_table.id`, not null: `true`, regtype: `integer` */
    id: number & {
      _brand: 'branding_test.test_table.id'
    }

    /** column: `branding_test.test_table.n`, regtype: `integer` */
    n: number | null
  }
}
