import {Options} from '../types'
import * as fs from 'fs'
import * as path from 'path'
import {pascalCase, tryOrDefault} from '../util'
import * as pgSqlAstParser from 'pgsql-ast-parser'
import * as crypto from 'crypto'
import * as assert from 'assert'

const paramMarker = `__uniqueString__${crypto.randomBytes(16).join('')}`

export const extractSQLFile: Options['extractQueries'] = file => {
  const sql = fs.readFileSync(file).toString()
  return [
    {
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

        const ast = mapper.statement(asts[0])!
        const unparamifiedSql = pgSqlAstParser.toSql.statement(ast)

        return unparamifiedSql.split(new RegExp(`"?${paramMarker}"?`))
      }, [sql]),
    },
  ]
}
