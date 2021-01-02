import * as slonik from 'slonik'
import * as types from './types'

export {types}

export interface GenericSqlTaggedTemplateType<T> {
  <U = T>(
    template: TemplateStringsArray,
    ...vals: slonik.ValueExpressionType[]
  ): slonik.TaggedTemplateLiteralInvocationType<U>
}

export type SqlType = typeof slonik.sql & {
  /**
   * Template tag for queries returning `MessageId`
   *
   * @example
   * ```
   * await connection.query(sql.MessageId`
   *   insert into messages(content) values ($1) returning id
   * `)
   * ```
   */
  MessageId: GenericSqlTaggedTemplateType<types.MessageId>
  /**
   * Template tag for queries returning `Message`
   *
   * @example
   * ```
   * await connection.query(sql.Message`
   *   select * from messages where id < $1 order by created_at desc limit 10
   * `)
   * ```
   */
  Message: GenericSqlTaggedTemplateType<types.Message>
}

/**
 * Wrapper for `slonik.sql` with properties for types `MessageId`, `Message`
 *
 * @example
 * ```
 * const result = await connection.query(sql.MessageId`
 *  insert into messages(content) values ($1) returning id
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
    return slonik.sql(...args)
  },
  // attach helpers (`sql.join`, `sql.unnest` etc.) to wrapper function
  slonik.sql,
  // attach type tags
  {
    MessageId: slonik.sql,
    Message: slonik.sql,
  },
)
