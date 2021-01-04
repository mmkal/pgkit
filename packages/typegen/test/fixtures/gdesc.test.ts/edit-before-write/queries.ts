import {sql} from 'slonik'

export const q = sql<queries.TestTable>`select id from test_table`

module queries {
  /** - query: `select id from test_table` */
  export interface TestTable {
    /** postgres type: integer */
    id: number
  }
}
