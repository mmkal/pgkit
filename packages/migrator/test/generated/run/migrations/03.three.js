module.exports.up = ({context: {connection, sql}}) => connection.query(sql`create table migration_test_3(id int)`)
module.exports.down = ({context: {connection, sql}}) => connection.query(sql`drop table migration_test_3`)
