/**
 * - query: `select * from messages where id < $1 order by created_at desc limit 10`
 * - file: src/index.ts
 */
export interface Message {
  /** postgres type: integer */
  id: number | null
  /** postgres type: character varying(20) */
  content: string | null
  /** postgres type: timestamp with time zone */
  created_at: string | null
  /** postgres type: message_priority */
  priority: 'high' | 'low' | 'medium' | null
}
