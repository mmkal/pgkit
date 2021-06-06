import {sql} from 'slonik'

export default [
  sql`update test_table set n = 0`,
  sql`insert into test_table values (0, 0)`,
  sql<queries._void>`create table x (y int)`,
]

export declare namespace queries {
  /** - query: `create table x (y int)` */
  export type _void = void
}
