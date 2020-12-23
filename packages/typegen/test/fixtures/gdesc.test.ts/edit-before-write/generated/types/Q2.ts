/**
 * - query: `select 'foo' as f, 'bar' as b`
 * - file: packages/typegen/test/fixtures/gdesc.test.ts/edit-before-write/queries.ts
 */
export interface Q2 {
  /** postgres type: text */
  f: string & { _brand: "foo" };
  /** postgres type: text */
  b: string;
}
