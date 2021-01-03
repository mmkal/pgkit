import {sql, createPool} from 'slonik'

export const foo = () => {
  return sql<queries.Messages_id_content>`select id, content from messages`
}

export const bar = () => {
  return [
    //
    sql<queries.Nn>`select * from nn where t = ${1}`,
    sql<queries.Messages_id_content>`select id, content from messages`,
    sql<queries.Messages>`select * from messages`,
    sql<queries.Messages_id>`select id from messages`,
    sql<queries.Messages_count>`select count(*) from messages`,
    sql<queries.PgAdvisoryLock>`select pg_advisory_lock(123)`,
    sql<queries.Messages_id_createdAt>`insert into messages(id, content) values (1, ${'hi'}) returning id, created_at`,
  ]
}

export const baz = async () => {
  const x = await createPool('').one(foo())
}

module queries {
  /** - query: `select id, content from messages` */
  export interface Messages_id_content {
    /** postgres type: integer */
    id: number
    /** postgres type: character varying(20) */
    content: string | null
  }

  /** - query: `select * from nn where t = $1` */
  export interface Nn {
    /** postgres type: integer */
    id: number
    /** postgres type: integer */
    x: number
    /**
     * some text value that does not really mean anything
     *
     * postgres type: text
     */
    t: string | null
    /** postgres type: text[] */
    a: Array<string> | null
    /** postgres type: json */
    j: unknown
    /** postgres type: jsonb */
    jb: unknown
  }

  /** - query: `select * from messages` */
  export interface Messages {
    /** postgres type: integer */
    id: number
    /** postgres type: character varying(20) */
    content: string | null
    /** postgres type: timestamp with time zone */
    created_at: Date
    /** postgres type: message_priority */
    priority: 'high' | 'low' | 'medium' | null
  }

  /** - query: `select id from messages` */
  export interface Messages_id {
    /** postgres type: integer */
    id: number
  }

  /** - query: `select count(*) from messages` */
  export interface Messages_count {
    /** postgres type: bigint */
    count: number | null
  }

  /** - query: `select pg_advisory_lock(123)` */
  export interface PgAdvisoryLock {
    /** postgres type: void */
    pg_advisory_lock: unknown
  }

  /** - query: `insert into messages(id, content) values (1, $1) returning id, created_at` */
  export interface Messages_id_createdAt {
    /** postgres type: integer */
    id: number
    /** postgres type: timestamp with time zone */
    created_at: Date
  }
}
