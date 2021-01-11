import {sql} from 'slonik'
import * as queries from './__sql__/b'

export default sql<queries.A>`select 1 as a`
