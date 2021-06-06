import {sql} from 'slonik'

export default [
  sql<queries._void>`update test_table set n = 0`,
  sql<queries._void>`insert into test_table values (0, 0)`,
  sql<queries._void>`create table x (y int)`,
]

export declare namespace queries {
  /**
   * queries:
   * - `update test_table set n = 0`
   * - `insert into test_table values (0, 0)`
   * - `create table x (y int)`
   */
  export type _void = void
}
