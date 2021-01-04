import {sql} from 'slonik'

export default sql<queries.A>`select 1 as a`

module queries {
  /** - query: `select 1 as a` */
  export interface A {
    /** postgres type: `integer` */
    a: number | null
  }
}
