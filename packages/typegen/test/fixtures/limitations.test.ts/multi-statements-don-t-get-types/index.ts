import {sql} from 'slonik'

export default sql`
  insert into test_table(id, n) values (1, 2);
  insert into test_table(id, n) values (3, 4);
`
