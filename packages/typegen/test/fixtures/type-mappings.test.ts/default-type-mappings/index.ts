import {sql} from 'slonik'

export default sql<queries.A_b>`
  select
    null::timestamptz as a,
    null::uuid as b
`

export declare namespace queries {
  /** - query: `select null::timestamptz as a, null::uuid as b` */
  export interface A_b {
    /** regtype: `timestamp with time zone` */
    a: number | null

    /** regtype: `uuid` */
    b: unknown
  }
}
