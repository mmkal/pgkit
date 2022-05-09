import {containsIgnoreComment, globList, isReturningQuery, typeName} from '../src/util'
import {getterExpression} from '../src/write/typescript'

test('typeName', () => {
  expect(typeName('foo')).toEqual('Foo')
  expect(typeName('1foo')).toEqual('_1Foo')
})

test('getterExpression', () => {
  expect(getterExpression('foo')).toEqual('.foo')
  expect(getterExpression('not an identifier')).toEqual(`["not an identifier"]`)
})

test('globList', () => {
  expect(globList(['foo'])).toEqual('foo')
  expect(globList(['foo', 'bar'])).toEqual('{foo,bar}')
})

test('isReturningQuery', () => {
  // queries that return a result
  expect(isReturningQuery('select * from table')).toBe(true)
  expect(isReturningQuery('(select * from table)')).toBe(true)
  expect(isReturningQuery('SELECT * from table')).toBe(true)
  expect(
    isReturningQuery(`
  
  select * from table`),
  ).toBe(true)
  expect(isReturningQuery('values (1, 2, 3)')).toBe(true)
  expect(isReturningQuery('VALUES (1, 2, 3)')).toBe(true)
  expect(isReturningQuery('update table set col=1 returning col')).toBe(true)
  expect(isReturningQuery('update table set col=1 RETURNING 1')).toBe(true)
  expect(isReturningQuery('with test as (values (1, 2, 3)) select * from test')).toBe(true)

  // queries not returning a result / fragments

  expect(isReturningQuery('where col = 1')).toBe(false)
  expect(isReturningQuery("where col = 'select'")).toBe(false)
  expect(isReturningQuery("where col = ' selector '")).toBe(false)
  expect(isReturningQuery('update table set col=1')).toBe(false)
  expect(isReturningQuery('create database test')).toBe(false)

  // known false positives - may potentially be fixed, but are accepted to keep the regex simple: better to accept a few false positives than false negatives
  expect(isReturningQuery('insert into table (a, b, c) values (1, 2, 3)')).toBe(true)
  expect(isReturningQuery('with test as (values 1, 2, 3) insert into table (a, b, c) test')).toBe(true)
  expect(isReturningQuery("where col = ' select '")).toBe(true)
})

test('containsIgnoreComment', () => {
  expect(containsIgnoreComment('--typegen-ignore')).toBe(true)
  expect(containsIgnoreComment('--typegen-IGNORE')).toBe(true)
  expect(containsIgnoreComment('--    typegen-ignore')).toBe(true)
  expect(containsIgnoreComment('/* typegen-ignore */')).toBe(true)
  expect(
    containsIgnoreComment(`
    with a as (values (1, 2))
    /*
    typegen-ignore
    */
   select * from t`),
  ).toBe(true)
  expect(
    containsIgnoreComment(`
    with a as (values (1, 2, 3))
  --typegen-ignore
  select * from test
  `),
  ).toBe(true)
  expect(containsIgnoreComment('/* typegen ignore */')).toBe(false)
  expect(
    containsIgnoreComment(`--
typegen-ignore`),
  ).toBe(false)

  expect(containsIgnoreComment('-- something typegen-ignore')).toBe(false)
})
