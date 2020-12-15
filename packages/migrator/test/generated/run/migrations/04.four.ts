import {Migration} from '../../../..'

export const up: Migration = ({slonik, sql}) => slonik.query(sql`create table migration_test_4(id int)`)
export const down: Migration = ({slonik, sql}) => slonik.query(sql`drop table migration_test_4`)