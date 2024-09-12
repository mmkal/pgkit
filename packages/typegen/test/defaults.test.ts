import {test, expect, vi as jest} from 'vitest'
import {defaults} from '../src'

const {resolveOptions} = defaults

test('default values are correct', () => {
  jest.spyOn(console, 'warn').mockReset()
  // some of the default values aren't used in tests (e.g. psqlCommand, which uses docker in tests)
  // this test checks their values anyway.
  expect(resolveOptions({})).toMatchObject({psqlCommand: 'psql'})
  expect(resolveOptions({})).toMatchObject({checkClean: ['before-migrate', 'after']})
})
