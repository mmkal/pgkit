import {sql} from 'slonik'

export default sql<queries.Table1>`
  with table1 as (select c as a from table2)
  select a from table1
`

export declare namespace queries {
  /** - query: `with table1 as (select c as a from table2) select a from table1` */
  export interface Table1 {
    /** column: `left_join_test.table1.a`, not null: `true`, regtype: `integer` */
    a: number
  }
}
