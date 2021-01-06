import {sql} from 'slonik'

export default [
  sql<queries.TestTable>`select * from gdesc_test.test_table`,
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
  sql<queries.TestTable_1>`select jb->'foo'->>'bar' from test_table`,
  sql<queries.TestTable_n>`select n::numeric from test_table`,
  sql<queries.Vals>`select * from (values (1, 'one'), (2, 'two')) as vals (num, letter)`,
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

module queries {
  /** - query: `select * from gdesc_test.test_table` */
  export interface TestTable {
    /** column: `gdesc_test.test_table.id`, not null: `true`, postgres type: `integer` */
    id: number

    /** column: `gdesc_test.test_table.n`, postgres type: `integer` */
    n: number | null

    /**
     * Some custom comment on "t"
     *
     * column: `gdesc_test.test_table.t`, postgres type: `text`
     */
    t: string | null

    /** column: `gdesc_test.test_table.t_nn`, not null: `true`, postgres type: `text` */
    t_nn: string

    /** column: `gdesc_test.test_table.cv`, postgres type: `character varying(1)` */
    cv: string | null

    /** column: `gdesc_test.test_table.arr`, postgres type: `text[]` */
    arr: Array<string> | null

    /** column: `gdesc_test.test_table.e`, postgres type: `test_enum` */
    e: ('aa' | 'bb' | 'cc') | null

    /** column: `gdesc_test.test_table.tz`, postgres type: `timestamp with time zone` */
    tz: number | null

    /** column: `gdesc_test.test_table.tz_nn`, not null: `true`, postgres type: `timestamp with time zone` */
    tz_nn: number

    /** column: `gdesc_test.test_table.j`, postgres type: `json` */
    j: unknown

    /** column: `gdesc_test.test_table.jb`, postgres type: `jsonb` */
    jb: unknown

    /** column: `gdesc_test.test_table.j_nn`, not null: `true`, postgres type: `json` */
    j_nn: unknown

    /** column: `gdesc_test.test_table.jb_nn`, not null: `true`, postgres type: `jsonb` */
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
    /** column: `gdesc_test.test_table.id`, not null: `true`, postgres type: `integer` */
    id: number

    /**
     * Some custom comment on "t"
     *
     * column: `gdesc_test.test_table.t`, postgres type: `text`
     */
    t: string | null
  }

  /** - query: `select count(*) from test_table` */
  export interface TestTable_count {
    /** not null: `true`, postgres type: `bigint` */
    count: number
  }

  /** - query: `select id as idalias, t as talias from test_table` */
  export interface TestTable_idalias_talias {
    /** column: `gdesc_test.test_table.id`, not null: `true`, postgres type: `integer` */
    idalias: number

    /**
     * Some custom comment on "t"
     *
     * column: `gdesc_test.test_table.t`, postgres type: `text`
     */
    talias: string | null
  }

  /**
   * queries:
   * - `select id from test_table where id = $1 and n = $2`
   * - `select t1.id from test_table t1 join test_table t2 on t1.id = t2.n`
   */
  export interface TestTable_id {
    /** column: `gdesc_test.test_table.id`, not null: `true`, postgres type: `integer` */
    id: number
  }

  /**
   * queries:
   * - `insert into test_table(id, j_nn, jb_nn) values (1, '{}', '{}')`
   * - `update test_table set t = ''`
   */
  export interface _void {}

  /** - query: `select pg_advisory_lock(123)` */
  export interface PgAdvisoryLock {
    /** postgres type: `void` */
    pg_advisory_lock: unknown
  }

  /** - query: `select jb->'foo'->>'bar' from test_table` */
  export interface TestTable_1 {
    /** postgres type: `text` */
    '?column?': string | null
  }

  /** - query: `select n::numeric from test_table` */
  export interface TestTable_n {
    /** postgres type: `numeric` */
    n: number | null
  }

  /** - query: `select * from (values (1, 'one'), (2, 'two')) as vals (num, letter)` */
  export interface Vals {
    /** postgres type: `integer` */
    num: number | null

    /** postgres type: `text` */
    letter: string | null
  }

  /** - query: `select t from (select id from test_table) t` */
  export interface T {
    /** postgres type: `record` */
    t: unknown
  }

  /** - query: `select t as t_aliased1, t_nn as t_nn_ali... [truncated] ...ed2 from test_table as tt2 where n = 1 )` */
  export interface TestTable_tAliased1_tNnAliased {
    /**
     * Some custom comment on "t"
     *
     * column: `gdesc_test.test_table.t`, postgres type: `text`
     */
    t_aliased1: string | null

    /** column: `gdesc_test.test_table.t_nn`, not null: `true`, postgres type: `text` */
    t_nn_aliased: string
  }
}
