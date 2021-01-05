/** - query: `select id, n from test_table` */
export interface TestTable {
  /** column: `sql_test.test_table.id`, not null: `true`, postgres type: `integer` */
  id: number
  /** column: `sql_test.test_table.n`, postgres type: `integer` */
  n: number | null
}
