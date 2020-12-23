import * as slonik from "slonik";
import * as types from "./types";

export { types };

export interface GenericSqlTaggedTemplateType<T> {
  <U = T>(
    template: TemplateStringsArray,
    ...vals: slonik.ValueExpressionType[]
  ): slonik.TaggedTemplateLiteralInvocationType<U>;
}

export type SqlType = typeof slonik.sql & {
  /**
   * Template tag for queries returning `Q1`
   *
   * @example
   * ```
   * await connection.query(sql.Q1`
   *   select 1 as a, 2 as b
   * `)
   * ```
   */
  Q1: GenericSqlTaggedTemplateType<types.Q1>;
  /**
   * Template tag for queries returning `Q2`
   *
   * @example
   * ```
   * await connection.query(sql.Q2`
   *   select 'foo' as f, 'bar' as b
   * `)
   * ```
   */
  Q2: GenericSqlTaggedTemplateType<types.Q2>;
};

/**
 * Wrapper for `slonik.sql` with properties for types `Q1`, `Q2`
 *
 * @example
 * ```
 * const result = await connection.query(sql.Q1`
 *  select 1 as a, 2 as b
 * `)
 *
 * result.rows.forEach(row => {
 *   // row is strongly-typed
 * })
 * ```
 *
 * It can also be used as a drop-in replacement for `slonik.sql`, the type tags are optional:
 *
 * @example
 * ```
 * const result = await connection.query(sql`
 *   select foo, bar from baz
 * `)
 *
 * result.rows.forEach(row => {
 *   // row is not strongly-typed, but you can still use it!
 * })
 * ```
 */
export const sql: SqlType = Object.assign(
  // wrapper function for `slonik.sql`
  (...args: Parameters<typeof slonik.sql>): ReturnType<typeof slonik.sql> => {
    return slonik.sql(...args);
  },
  // attach helpers (`sql.join`, `sql.unnest` etc.) to wrapper function
  slonik.sql,
  // attach type tags
  {
    Q1: slonik.sql,
    Q2: slonik.sql,
  }
);
