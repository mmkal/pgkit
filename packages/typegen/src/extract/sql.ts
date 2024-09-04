import * as assert from 'assert'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as pgSqlAstParser from 'pgsql-ast-parser'
import {Options} from '../types'
import {pascalCase, tryOrDefault} from '../util'

const paramMarker = `__uniqueString__${crypto.randomBytes(16).join('')}`

export const extractSQLFile: Options['extractQueries'] = file => {
  const sql = fs.readFileSync(file).toString()
  return [
    {
      type: 'extracted',
      text: sql,
      file,
      line: 1,
      context: [],
      source: sql,
      sql,
      tag: pascalCase(path.parse(file).name),
      template: tryOrDefault(() => {
        const mapper = pgSqlAstParser.astMapper(() => ({
          parameter: () => ({type: 'ref', name: paramMarker}),
        }))

        const asts = pgSqlAstParser.parse(sql)
        assert.strictEqual(asts.length, 1, `Exactly one statement supported`)

        const ast = mapper.statement(asts[0])
        const unparamifiedSql = pgSqlAstParser.toSql.statement(ast)

        // eslint-disable-next-line mmkal/@rushstack/security/no-unsafe-regexp
        return unparamifiedSql.split(new RegExp(`"?${paramMarker}"?`))
      }, [sql]),
    },
  ]
}
