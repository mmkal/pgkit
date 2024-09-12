import * as pgsqlAstParser from 'pgsql-ast-parser'
import {test, expect} from 'vitest'

expect.addSnapshotSerializer({
  test: Boolean,
  print: val => JSON.stringify(val, null, 2),
})

test('parse with casting', async () => {
  const input = `select json->'foo'::text->>'bar'::text as bar from table_with_json`
  const ast = pgsqlAstParser.parse(input)[0]
  const output = pgsqlAstParser.toSql.statement(ast)

  expect(output).toMatchInlineSnapshot(
    `"SELECT ((((json->'foo')::text )->>'bar')::text ) AS bar  FROM table_with_json"`,
  )
})
