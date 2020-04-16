import {Migration} from '../..'

export const up: Migration = ({slonik, sql}) => slonik.query(sql`create table migration_four(x text)`)
export const down: Migration = ({slonik, sql}) => slonik.query(sql`drop table migration_four`)
