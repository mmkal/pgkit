import {typeName} from '../src/util'
import {getterExpression} from '../src/write/typescript'

test('typeName', () => {
  expect(typeName('foo')).toEqual('Foo')
  expect(typeName('1foo')).toEqual('_1Foo')
})

test('getterExpression', () => {
  expect(getterExpression('foo')).toEqual('.foo')
  expect(getterExpression('not an identifier')).toEqual(`["not an identifier"]`)
})
