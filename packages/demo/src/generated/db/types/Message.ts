/**
 * - query: `select * from messages where id < $1 order by created_at desc limit 10`
 */
export interface Message {
  /** postgres type: integer */
  id: number;
  /** postgres type: character varying(20) */
  content: string;
  /** postgres type: timestamp with time zone */
  created_at: string;
  /** postgres type: message_priority */
  priority: "high" | "low" | "medium";
}
