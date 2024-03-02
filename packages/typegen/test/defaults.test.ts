import {test, expect, vi as jest} from 'vitest'
import {defaults} from '../src'

const {getParams} = defaults

test('default values are correct', () => {
  jest.spyOn(console, 'warn').mockReset()
  // some of the default values aren't used in tests (e.g. psqlCommand, which always uses docker)
  // this test checks their values anyway.
  expect(getParams({})).toMatchObject({psqlCommand: 'psql'})
  expect(getParams({})).toMatchObject({checkClean: ['before-migrate', 'after']})
})
