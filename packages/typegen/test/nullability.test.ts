import {isNonNullableField} from '../src/query/column-info'

describe('isNonNullableField', () => {
  const field = {name: 'x', regtype: 'int', typescript: 'number'}
  test.skip('determines primitives as not null', () => {
    // skipped => the responsibility for determining nullability for primitives resides in `getColumnInfo`.
    expect(isNonNullableField('select 1', field)).toBe(false)
    expect(isNonNullableField('select 1 as x', field)).toBe(false)
  })
  test('determines count(*) as not null', () => {
    expect(isNonNullableField('select count(*)', {...field, name: 'count'})).toBe(true)
    expect(isNonNullableField('select count(1) as x', field)).toBe(true)
  })
  test('respects aliases', () => {
    expect(isNonNullableField('select count(1) as x', {...field, name: 'y'})).toBe(false)
  })
  test('resolves coalesce as non-nullable, when arguments can be determined to be non-nullable', () => {
    // Note: Currently only Primitives are supported
    expect(isNonNullableField('select coalesce(1) as x', field)).toBe(true)
    expect(isNonNullableField('select coalesce(1, null) as x', field)).toBe(true)
    expect(isNonNullableField('select coalesce(sum(*), 1) as x', field)).toBe(true)
    expect(isNonNullableField('select coalesce(sum(*), 1, null) as x', field)).toBe(true)
  })
  test('only works for selects', () => {
    expect(isNonNullableField('update tablename set col=1', field)).toBe(false)
  })
  test('returns false for unknown/unsupported functions', () => {
    expect(isNonNullableField('select sum(*) as x', field)).toBe(false)
  })
  test.skip('resolves coalesce with nested functions', () => {
    // skipped => resolving nested function is currently not supported and requires the above centralisation to be done first.
    expect(isNonNullableField('select coalesce(1, count(1)) as x', field)).toBe(true)
  })
})
