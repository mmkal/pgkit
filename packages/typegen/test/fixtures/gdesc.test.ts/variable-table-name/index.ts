import {sql} from 'slonik'

const tableName = 'test_table'

export default sql<queries.Anonymous>`select * from ${sql.identifier([tableName])}`

module queries {
  /** - query: `select * from $1` */
  export interface Anonymous {}
}
