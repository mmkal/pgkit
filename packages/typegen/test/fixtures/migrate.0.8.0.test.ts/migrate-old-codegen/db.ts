import {sql} from 'slonik'

import {createPool} from 'slonik'

/* setupTypeGen call removed. There may be remaining references to poolConfig which should be deleted manually */

export const slonik = createPool('...', poolConfig)

export const queryA = sql<queries.A>`
  select 1 as a
`

export const queryB = sql<queries.B>`
  select 1 as b
`

export module queries {
  /** - query: `select 1 as a` */
  export interface A {
    /** regtype: `integer` */
    a: number | null
  }

  /** - query: `select 1 as b` */
  export interface B {
    /** regtype: `integer` */
    b: number | null
  }
}
