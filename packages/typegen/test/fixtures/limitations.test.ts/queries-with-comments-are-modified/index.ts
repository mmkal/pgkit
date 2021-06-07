import {sql} from 'slonik'

export default sql<queries.TestTable>`
  select
    1 as a, -- comment
    -- comment
    2 as b,
    '--' as c, -- comment
    id
  from
    -- comment
    test_table -- comment
`

export declare namespace queries {
  /** - query: `select 1 as a, -- comment -- comment 2 as b, '--' as c, -- comment id from -- comment test_table -- comment` */
  export interface TestTable {
    /** regtype: `integer` */
    a: number | null

    /** regtype: `integer` */
    b: number | null

    /** regtype: `text` */
    c: string | null

    /** column: `limitations_test.test_table.id`, not null: `true`, regtype: `integer` */
    id: number
  }
}
