/* eslint-disable mmkal/@typescript-eslint/no-extraneous-class */
import {expect, test} from 'vitest'
import {isa} from '../src'

test('isa', async () => {
  class A {
    x = 1
  }
  class B {
    y = 2
  }

  isa(new A(), A)

  expect(() => isa(new A(), B)).toThrowErrorMatchingInlineSnapshot(`[TypeError: Expected B, got A. Value: A { x: 1 }.]`)

  isa.record({a: new A()}, A)

  expect(() => isa.record(1, B)).toThrowErrorMatchingInlineSnapshot(
    `[TypeError: Expected Object, got Number. Value: 1.]`,
  )
  expect(() => isa.record({a: new A()}, B)).toThrowErrorMatchingInlineSnapshot(
    `[TypeError: Expected B, got A. Value: A { x: 1 }. Key: a]`,
  )
})
