import {sql} from 'slonik'

export default [sql<queries.Anonymous>`select '2000-01-01'::timestamptz, 1::int8, true::bool, '{}'::json`]

export module queries {
  /** - query: `select '2000-01-01'::timestamptz, 1::int8, true::bool, '{}'::json` */
  export interface Anonymous {
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
