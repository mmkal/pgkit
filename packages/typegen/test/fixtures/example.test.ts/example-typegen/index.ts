import {sql, createPool} from 'slonik'

export default async () => {
  const pool = createPool('...connection string...')

  const results = await pool.query(sql<queries.TestTable>`select foo, bar from test_table`)

  results.rows.forEach(r => {
    console.log(r.foo) // foo has type 'number'
    console.log(r.bar) // bar has type 'string | null'
  })
}

export module queries {
  /** - query: `select foo, bar from test_table` */
  export interface TestTable {
    /** column: `example_test.test_table.foo`, not null: `true`, regtype: `integer` */
    foo: number

    /**
     * Look, ma! A comment from postgres!
     *
     * column: `example_test.test_table.bar`, regtype: `text`
     */
    bar: string | null
  }
}
