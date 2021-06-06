import {sql} from 'slonik'

export default sql<queries.Abc_Def>`
  with abc as (select table_name as tname from information_schema.tables),
  def as (select table_schema as tschema from information_schema.tables)
  select tname as n, tschema as s from abc join def on abc.tname = def.tschema
`

export declare namespace queries {
  /** - query: `with abc as (select table_name as tname ... [truncated] ... abc join def on abc.tname = def.tschema` */
  export interface Abc_Def {
    /** regtype: `name` */
    n: string | null

    /** regtype: `name` */
    s: string | null
  }
}
