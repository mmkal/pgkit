import {GdescriberParams} from '../types'
import * as fs from 'fs'
import * as path from 'path'
import {pascalCase} from '../util'

// todo: use this to generate a command getter:
// `sql.file('type/checked/relative/path/to/file.sql', values: [type, checked, variables, too])`
// todo: send `prepare mystatement ${sqlFileContents}` to postgres then query `select parameter_types from pg_prepared_statements where name = 'mystatement'`
// or does that belong in a separate lib? I like it here I think.
export const extractSQLFile: GdescriberParams['extractQueries'] = file => {
  const sql = fs.readFileSync(file).toString()
  return [
    {
      text: sql,
      file,
      sql,
      tag: pascalCase(path.parse(file).name),
      template: [sql], // todo: split based on `$1` or something?
    },
  ]
}
