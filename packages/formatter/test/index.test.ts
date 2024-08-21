import {test, expect} from 'vitest'
import {formatSql} from '../src'

test('formatter', async () => {
  expect(formatSql('Select * From "foo"')).toMatchInlineSnapshot(`
    "Select
      *
    From
      "foo""
  `)
})
