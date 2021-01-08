import {getParams} from '../src'

test('default values are correct', () => {
  // some of the default values aren't used in tests (e.g. psqlCommand, which always uses docker)
  // this test checks their values anyway.
  expect(getParams({})).toMatchObject({psqlCommand: 'psql'})
  expect(getParams({})).toMatchObject({checkClean: ['before-migrate', 'after']})
})
