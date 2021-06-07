import {sql} from 'slonik'

export default sql<queries.A_b>`
  select 1 as a, 'two' as b
`

export declare namespace queries {
  /** - query: `select 1 as a, 'two' as b` */
  export interface A_b {
    /** regtype: `integer` */
    a: number | null

    /** regtype: `text` */
    b: string | null
  }
}
