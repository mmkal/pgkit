/**
 * - query: `insert into messages(content) values ($1) returning id`
 * - file: src/index.ts
 */
export interface MessageId {
  /** postgres type: integer */
  id: number;
}
