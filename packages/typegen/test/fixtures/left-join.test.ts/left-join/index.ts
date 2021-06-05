import {sql, createPool} from 'slonik'

export default async () => {
  const pool = createPool('...connection string...')

  return pool.query(sql<queries.Table1_Table2>`
    select a, b
    from table1
    left join table2 on table1.a = table2.b
  `)
}

export declare namespace queries {
  /** - query: `select a, b from table1 left join table2 on table1.a = table2.b` */
  export interface Table1_Table2 {
    /** column: `left_join_test.table1.a`, not null: `true`, regtype: `integer` */
    a: number

    /** column: `left_join_test.table2.b`, regtype: `integer` */
    b: number | null
  }
}
