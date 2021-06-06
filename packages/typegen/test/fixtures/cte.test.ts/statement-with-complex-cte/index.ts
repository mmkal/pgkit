import {sql} from 'slonik'

export default sql<queries.Def>`
  with abc as (select table_name from information_schema.tables),
  def as (select table_schema from information_schema.tables, abc)
  select * from def
`

export declare namespace queries {
  /** - query: `with abc as (select table_name from info... [truncated] ...on_schema.tables, abc) select * from def` */
  export interface Def {
    /** regtype: `name` */
    table_schema: string | null
  }
}
