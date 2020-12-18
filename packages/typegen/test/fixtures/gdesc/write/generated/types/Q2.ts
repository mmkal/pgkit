/**
 * - query: `select 'foo' as f, 'bar' as b`
 */
export interface Q2 {
  /** postgres type: text */
  f: string;
  /** postgres type: text */
  b: string;
}
