/**
 * - query: `select 1 as a, 2 as b`
 * - file: packages/typegen/test/fixtures/gdesc.test.ts/edit-before-write/queries.ts
 */
export interface Q1 {
  /** postgres type: integer */
  a: number;
  /** postgres type: integer */
  b: number;
}
