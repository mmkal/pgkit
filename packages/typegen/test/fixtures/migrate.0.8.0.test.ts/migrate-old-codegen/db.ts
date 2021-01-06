import {sql} from 'slonik'

import {createPool} from 'slonik'

/* setupTypeGen call removed. There may be remaining references to poolConfig which should be deleted manually */

export const slonik = createPool('...', poolConfig)

export const queryA = sql`
  select 1 as a
`

export const queryB = sql`
  select 1 as b
`
