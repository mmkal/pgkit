import {sql} from 'slonik'

export default [
  sql<queries.Timestamptz_int8_bool_json>`select '2000-01-01'::timestamptz, 1::int8, true::bool, '{}'::json`,
]

export declare namespace queries {
  /** - query: `select '2000-01-01'::timestamptz, 1::int8, true::bool, '{}'::json` */
  export interface Timestamptz_int8_bool_json {
    /** regtype: `timestamp with time zone` */
    timestamptz: Date | null

    /** regtype: `bigint` */
    int8: bigint | null

    /** regtype: `boolean` */
    bool: boolean | null

    /** regtype: `json` */
    json: unknown
  }
}
