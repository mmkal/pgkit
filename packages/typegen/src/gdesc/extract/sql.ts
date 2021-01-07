import {Options} from '../types'
import * as fs from 'fs'
import * as path from 'path'
import {pascalCase, tryOrDefault} from '../util'
import * as pgSqlAstParser from 'pgsql-ast-parser'
import * as crypto from 'crypto'

const paramMarker = `__uniqueString__${crypto.randomBytes(16).join('')}`

export const extractSQLFile: Options['extractQueries'] = file => {
  const sql = fs.readFileSync(file).toString()
  return [
    {
      text: sql,
      file,
      source: sql,
      sql,
      tag: pascalCase(path.parse(file).name),
      template: tryOrDefault(() => {
        const mapper = pgSqlAstParser.astMapper(() => ({
          parameter: () => ({type: 'ref', name: paramMarker}),
        }))

        const ast = mapper.statement(pgSqlAstParser.parseFirst(sql))!
        const unparamifiedSql = pgSqlAstParser.toSql.statement(ast)

        return unparamifiedSql.split(new RegExp(`"?${paramMarker}"?`))
      }, [sql]),
    },
  ]
}
