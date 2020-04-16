module.exports.up = ({slonik, sql}) => slonik.query(sql`create table migration_three(x text)`)
module.exports.down = ({slonik, sql}) => slonik.query(sql`drop table migration_three`)
