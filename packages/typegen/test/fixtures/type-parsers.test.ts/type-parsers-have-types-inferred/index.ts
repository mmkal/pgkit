import {sql} from 'slonik'

export default [sql<queries.Anonymous>`select '2000-01-01'::timestamptz, 1::int8, true::bool, '{}'::json`]

module queries {
  /** - query: `select '2000-01-01'::timestamptz, 1::int8, true::bool, '{}'::json` */
  export interface Anonymous {
    /** postgres type: `timestamp with time zone` */
    timestamptz: Date | null

    /** postgres type: `bigint` */
    int8: bigint | null

    /** postgres type: `boolean` */
    bool: boolean | null

    /** postgres type: `json` */
    json: unknown
  }
}
