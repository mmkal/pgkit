import * as queries from './__sql__/a'
import {sql} from 'slonik'

export default sql<queries.A>`select 1 as a`
