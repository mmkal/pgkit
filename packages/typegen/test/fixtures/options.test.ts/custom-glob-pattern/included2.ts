import {sql} from 'slonik'

export default sql<queries.A>`select 2 as a`

module queries {
  /** - query: `select 2 as a` */
  export interface A {
    /** postgres type: `integer` */
    a: number | null
  }
}
