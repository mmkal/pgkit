import {Options} from '../types'
import * as fs from 'fs'
import * as path from 'path'
import {pascalCase} from '../util'

export const extractSQLFile: Options['extractQueries'] = file => {
  const sql = fs.readFileSync(file).toString()
  return [
    {
      text: sql,
      file,
      source: sql,
      sql,
      tag: pascalCase(path.parse(file).name),
      template: [sql], // todo: split based on `$1` or something?
    },
  ]
}
