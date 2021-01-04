import {sql} from 'slonik'

const tableName = 'test_table'

export default sql`select * from ${sql.identifier([tableName])}`
