import {sql, createPool} from 'slonik'

export const foo = () => {
  return sql<queries.Messages_id_content>`select id, content from messages`
}

export const bar = () => {
  return [
    //
    sql<queries.Messages_id_content>`select id, content from messages`,
    sql<queries.Messages>`select * from messages`,
    sql<queries.Messages_id>`select id from messages`,
    sql<queries.Messages_count>`select count(*) from messages`,
    sql<queries.PgAdvisoryLock>`select pg_advisory_lock(123)`,
    sql<queries.PgAdvisoryLock>`insert into messages(id, content) values (1, ${'hi'}) returning id`,
  ]
}

export const baz = async () => {
  const x = await createPool('').one(foo())
}

module queries {
  /**
   * - query: `select id, content from messages`
   */
  export interface Messages_id_content {
    /** postgres type: integer */
    id: number
    /** postgres type: character varying(20) */
    content: string
  }

  /**
   * - query: `select * from messages`
   */
  export interface Messages {
    /** postgres type: integer */
    id: number
    /** postgres type: character varying(20) */
    content: string
    /** postgres type: timestamp with time zone */
    created_at: string
    /** postgres type: message_priority */
    priority: 'high' | 'low' | 'medium'
  }

  /**
   * - query: `select id from messages`
   */
  export interface Messages_id {
    /** postgres type: integer */
    id: number
  }

  /**
   * - query: `select count(*) from messages`
   */
  export interface Messages_count {
    /** postgres type: bigint */
    count: unknown
  }

  /**
   * - query: `select pg_advisory_lock(123)`
   */
  export interface PgAdvisoryLock {
    /** postgres type: void */
    pg_advisory_lock: unknown
  }
}
