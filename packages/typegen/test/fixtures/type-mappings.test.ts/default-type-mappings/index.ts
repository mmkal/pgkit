import {sql} from 'slonik'

export default sql<queries.A_b_c>`
  select
    null::timestamptz as a,
    null::uuid as b,
    null::void as c
`

export declare namespace queries {
  /** - query: `select null::timestamptz as a, null::uuid as b, null::void as c` */
  export interface A_b_c {
    /** regtype: `timestamp with time zone` */
    a: number | null

    /** regtype: `uuid` */
    b: string | null

    /** regtype: `void` */
    c: void
  }
}
