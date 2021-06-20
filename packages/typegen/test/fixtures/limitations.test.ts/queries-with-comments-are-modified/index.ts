import {sql} from 'slonik'

export default sql`
  select
    1 as a, -- comment
    -- comment
    2 as b,
    '--' as c, -- comment
    id
  from
    -- comment
    test_table -- comment
`
