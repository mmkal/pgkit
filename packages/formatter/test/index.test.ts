import {test, expect} from 'vitest'
import {formatSql} from '../src'

test('formatter', async () => {
  expect(await formatSql('Select * From "foo"')).toMatchInlineSnapshot(`
    "select * from "foo";
    "
  `)
})
