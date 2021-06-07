import {sql} from 'slonik'

export default sql`
  with abc as (
    select table_name -- comment
    from information_schema.tables
  ),
  def as (
    select table_schema
    from information_schema.tables, abc
  )
  select * from def
`
