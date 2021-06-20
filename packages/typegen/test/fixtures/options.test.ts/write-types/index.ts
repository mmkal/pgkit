import {sql} from 'slonik'

export default [
  sql<queries.TestTable>`select * from options_test.test_table`,
  sql<queries.TestTable_id_t>`select id, t from test_table`,
  sql<queries.TestTable_count>`select count(*) from test_table`,
  sql<queries.TestTable_idalias_talias>`select id as idalias, t as talias from test_table`,
  sql<queries.TestTable_id>`select id from test_table where id = ${1} and n = ${2}`,
  sql<queries._void>`insert into test_table(id, j_nn, jb_nn) values (1, '{}', '{}')`,
  sql<queries._void>`update test_table set t = ''`,
  sql<queries.TestTable_id_t>`insert into test_table(id, t_nn, j_nn, jb_nn) values (1, '', '{}', '{}') returning id, t`,
  sql<queries.TestTable_id_t>`update test_table set t = '' returning id, t`,
  sql<queries.TestTable_id_t>`insert into test_table as tt (id, j_nn, jb_nn) values (1, '{}', '{}') returning id, t`,
  sql<queries.TestTable_id_t>`update test_table as tt set t = '' returning id, t`,
  sql<queries.PgAdvisoryLock>`select pg_advisory_lock(123)`,
  sql<queries.TestTable_id>`select t1.id from test_table t1 join test_table t2 on t1.id = t2.n`,
  sql<queries.Column>`select jb->'foo'->>'bar' from test_table`,
  sql<queries.TestTable_n>`select n::numeric from test_table`,
  sql<queries.Val>`select * from (values (1, 'one'), (2, 'two')) as vals (num, letter)`,
  sql<queries.T>`select t from (select id from test_table) t`,
  sql<queries.TestTable_tAliased1_tNnAliased>`
    select t as t_aliased1, t_nn as t_nn_aliased
    from test_table as tt1
    where
      t_nn in (
        select t_nn as t_aliased2
        from test_table as tt2
        where n = 1
      )
  `,
]

export declare namespace queries {
  /** - query: `select * from options_test.test_table` */
  export interface TestTable {
    /** column: `options_test.test_table.id`, not null: `true`, regtype: `integer` */
    id: number

    /** column: `options_test.test_table.n`, regtype: `integer` */
    n: number | null

    /**
     * Some custom comment on "t"
     *
     * column: `options_test.test_table.t`, regtype: `text`
     */
    t: string | null

    /** column: `options_test.test_table.t_nn`, not null: `true`, regtype: `text` */
    t_nn: string

    /** column: `options_test.test_table.cv`, regtype: `character varying(1)` */
    cv: string | null

    /** column: `options_test.test_table.arr`, regtype: `text[]` */
    arr: string[] | null

    /** column: `options_test.test_table.e`, regtype: `test_enum` */
    e: ('aa' | 'bb' | 'cc') | null

    /** column: `options_test.test_table.tz`, regtype: `timestamp with time zone` */
    tz: number | null

    /** column: `options_test.test_table.tz_nn`, not null: `true`, regtype: `timestamp with time zone` */
    tz_nn: number

    /** column: `options_test.test_table.j`, regtype: `json` */
    j: unknown

    /** column: `options_test.test_table.jb`, regtype: `jsonb` */
    jb: unknown

    /** column: `options_test.test_table.j_nn`, not null: `true`, regtype: `json` */
    j_nn: unknown

    /** column: `options_test.test_table.jb_nn`, not null: `true`, regtype: `jsonb` */
    jb_nn: unknown
  }

  /**
   * queries:
   * - `select id, t from test_table`
   * - `insert into test_table(id, t_nn, j_nn, jb_nn) values (1, '', '{}', '{}') returning id, t`
   * - `update test_table set t = '' returning id, t`
   * - `insert into test_table as tt (id, j_nn, jb_nn) values (1, '{}', '{}') returning id, t`
   * - `update test_table as tt set t = '' returning id, t`
   */
  export interface TestTable_id_t {
    /** column: `options_test.test_table.id`, not null: `true`, regtype: `integer` */
    id: number

    /**
     * Some custom comment on "t"
     *
     * column: `options_test.test_table.t`, regtype: `text`
     */
    t: string | null
  }

  /** - query: `select count(*) from test_table` */
  export interface TestTable_count {
    /** not null: `true`, regtype: `bigint` */
    count: number
  }

  /** - query: `select id as idalias, t as talias from test_table` */
  export interface TestTable_idalias_talias {
    /** column: `options_test.test_table.id`, not null: `true`, regtype: `integer` */
    idalias: number

    /**
     * Some custom comment on "t"
     *
     * column: `options_test.test_table.t`, regtype: `text`
     */
    talias: string | null
  }

  /**
   * queries:
   * - `select id from test_table where id = $1 and n = $2`
   * - `select t1.id from test_table t1 join test_table t2 on t1.id = t2.n`
   */
  export interface TestTable_id {
    /** column: `options_test.test_table.id`, not null: `true`, regtype: `integer` */
    id: number
  }

  /**
   * queries:
   * - `insert into test_table(id, j_nn, jb_nn) values (1, '{}', '{}')`
   * - `update test_table set t = ''`
   */
  export type _void = void

  /** - query: `select pg_advisory_lock(123)` */
  export interface PgAdvisoryLock {
    /** regtype: `void` */
    pg_advisory_lock: void
  }

  /** - query: `select jb->'foo'->>'bar' from test_table` */
  export interface Column {
    /** regtype: `text` */
    '?column?': string | null
  }

  /** - query: `select n::numeric from test_table` */
  export interface TestTable_n {
    /** regtype: `numeric` */
    n: number | null
  }

  /** - query: `select * from (values (1, 'one'), (2, 'two')) as vals (num, letter)` */
  export interface Val {
    /** regtype: `integer` */
    num: number | null

    /** regtype: `text` */
    letter: string | null
  }

  /** - query: `select t from (select id from test_table) t` */
  export interface T {
    /** regtype: `record` */
    t: unknown
  }

  /** - query: `select t as t_aliased1, t_nn as t_nn_ali... [truncated] ...ed2 from test_table as tt2 where n = 1 )` */
  export interface TestTable_tAliased1_tNnAliased {
    /**
     * Some custom comment on "t"
     *
     * column: `options_test.test_table.t`, regtype: `text`
     */
    t_aliased1: string | null

    /** column: `options_test.test_table.t_nn`, not null: `true`, regtype: `text` */
    t_nn_aliased: string
  }
}
