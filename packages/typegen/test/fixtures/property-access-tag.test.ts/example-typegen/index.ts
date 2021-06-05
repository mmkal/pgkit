import * as slonik from 'slonik'

export default async () => {
  const pool = slonik.createPool('...connection string...')

  const results = await pool.query(slonik.sql<queries.TestTable>`select foo, bar from test_table`)

  results.rows.forEach(r => {
    console.log(r.foo) // foo has type 'number'
    console.log(r.bar) // bar has type 'string | null'
  })
}

export declare namespace queries {
  /** - query: `select foo, bar from test_table` */
  export interface TestTable {
    /** column: `property_access_tag_test.test_table.foo`, not null: `true`, regtype: `integer` */
    foo: number

    /**
     * Look, ma! A comment from postgres!
     *
     * column: `property_access_tag_test.test_table.bar`, regtype: `text`
     */
    bar: string | null
  }
}
