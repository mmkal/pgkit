module.exports.up = ({slonik, sql}) => slonik.query(sql`create table migration_test_3(id int)`)
module.exports.down = ({slonik, sql}) => slonik.query(sql`drop table migration_test_3`)