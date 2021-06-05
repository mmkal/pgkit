import {sql} from 'slonik'

export default sql<queries.A>`select 1 as a`

export declare namespace queries {
  /** - query: `select 1 as a` */
  export interface A {
    /** regtype: `integer` */
    a: number | null
  }
}
