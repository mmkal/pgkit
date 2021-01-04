import {sql} from 'slonik'

export default [
  sql<queries.TestTable>`select * from gdesc_test.test_table`,
  sql<queries.TestTable_id_t>`select id, t from test_table`,
  sql<queries.TestTable_idalias_talias>`select id as idalias, t as talias from test_table`,
  sql<queries.TestTable_id>`select id from test_table where id = ${1} and n = ${2}`,
  sql<queries._void>`insert into test_table(id, j_nn, jb_nn) values (1, '{}', '{}')`,
  sql<queries._void_2>`update test_table set t = ''`,
  sql<queries.TestTable_0>`insert into test_table(id, t_nn, j_nn, jb_nn) values (1, '', '{}', '{}') returning id, t`,
  sql<queries.TestTable_0>`update test_table set t = '' returning id, t`,
  sql<queries.TestTable_0>`insert into test_table as tt (id, j_nn, jb_nn) values (1, '{}', '{}') returning id, t`,
  sql<queries.TestTable_0>`update test_table as tt set t = '' returning id, t`,
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
    /** postgres type: integer */
    id: number
    /** postgres type: integer */
    n: number | null
    /**
     * Some custom comment on "t"
     *
     * postgres type: text
     */
    t: string | null
    /** postgres type: text */
    t_nn: string
    /** postgres type: timestamp with time zone */
    tz: number | null
    /** postgres type: timestamp with time zone */
    tz_nn: number
    /** postgres type: json */
    j: unknown
    /** postgres type: jsonb */
    jb: unknown
    /** postgres type: json */
    j_nn: unknown
    /** postgres type: jsonb */
    jb_nn: unknown
  }

  /** - query: `select id, t from test_table` */
  export interface TestTable_id_t {
    /** postgres type: integer */
    id: number
    /**
     * Some custom comment on "t"
     *
     * postgres type: text
     */
    t: string | null
  }

  /** - query: `select id as idalias, t as talias from test_table` */
  export interface TestTable_idalias_talias {
    /** postgres type: integer */
    idalias: number
    /**
     * Some custom comment on "t"
     *
     * postgres type: text
     */
    talias: string | null
  }

  /** - query: `select id from test_table where id = $1 and n = $2` */
  export interface TestTable_id {
    /** postgres type: integer */
    id: number
  }

  /** - query: `insert into test_table(id, j_nn, jb_nn) values (1, '{}', '{}')` */
  export interface _void {}

  /** - query: `update test_table set t = ''` */
  export interface _void_2 {}

  /** - query: `insert into test_table(id, t_nn, j_nn, jb_nn) values (1, '', '{}', '{}') returning id, t` */
  export interface TestTable_0 {
    /** postgres type: integer */
    id: number
    /**
     * Some custom comment on "t"
     *
     * postgres type: text
     */
    t: string | null
  }

  /** - query: `update test_table set t = '' returning id, t` */
  export interface TestTable_0 {
    /** postgres type: integer */
    id: number
    /**
     * Some custom comment on "t"
     *
     * postgres type: text
     */
    t: string | null
  }

  /** - query: `insert into test_table as tt (id, j_nn, jb_nn) values (1, '{}', '{}') returning id, t` */
  export interface TestTable_0 {
    /** postgres type: integer */
    id: number
    /**
     * Some custom comment on "t"
     *
     * postgres type: text
     */
    t: string | null
  }

  /** - query: `update test_table as tt set t = '' returning id, t` */
  export interface TestTable_0 {
    /** postgres type: integer */
    id: number
    /**
     * Some custom comment on "t"
     *
     * postgres type: text
     */
    t: string | null
  }

  /** - query: `select t as t_aliased1, t_nn as t_nn_ali... [truncated] ...ed2 from test_table as tt2 where n = 1 )` */
  export interface TestTable_tAliased1_tNnAliased {
    /**
     * Some custom comment on "t"
     *
     * postgres type: text
     */
    t_aliased1: string | null
    /** postgres type: text */
    t_nn_aliased: string
  }
}
