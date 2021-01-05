import {sql} from 'slonik'

export default sql<queries.TestTable>`select id, n from test_table`

module queries {
    /** - query: `select id, n from test_table` */
    export interface TestTable {
        /** column: `ugly_test.test_table.id`, not null: `true`, postgres type: `integer` */
        id: number;
        /** column: `ugly_test.test_table.n`, postgres type: `integer` */
        n: (number) | null;
    }
}
