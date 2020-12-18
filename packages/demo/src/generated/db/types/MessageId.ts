/**
 * - query: `insert into messages(content) values ($1) returning id`
 */
export interface MessageId {
  /** postgres type: integer */
  id: number;
}
