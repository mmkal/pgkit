import {sql} from 'slonik'

export default sql<queries.TestTable1>`
  with test_table1 as (select b as a from test_table2)
  select a from test_table1
`

export declare namespace queries {
  /** - query: `with test_table1 as (select b as a from test_table2) select a from test_table1` */
  export interface TestTable1 {
    /** regtype: `integer` */
    a: number | null
  }
}
