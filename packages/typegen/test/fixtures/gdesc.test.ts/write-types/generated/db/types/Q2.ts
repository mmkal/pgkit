/**
 * - query: `select 'foo' as f, 'bar' as b`
 * - file: packages/typegen/test/fixtures/gdesc.test.ts/write-types/queries.ts
 */
export interface Q2 {
  /** postgres type: text */
  f: string;
  /** postgres type: text */
  b: string;
}
