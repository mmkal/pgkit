import {isNonNullableField} from '../src/query/column-info'

test('isNonNullableField', () => {
  const field = {name: 'x', regtype: 'int', typescript: 'number'}
  expect(isNonNullableField('select 1 as x', field)).toBe(false)
  expect(isNonNullableField('select count(1) as x', field)).toBe(true)
  expect(isNonNullableField('select count(1) as x', {...field, name: 'y'})).toBe(false)
  expect(isNonNullableField('select coalesce(1, count(1)) as x', field)).toBe(true)
})
