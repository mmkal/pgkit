import {sql} from './generated'

export const q1 = sql.Q1`select 1 as a, 2 as b`
export const q2 = sql.Q2`select 'foo' as f, 'bar' as b`