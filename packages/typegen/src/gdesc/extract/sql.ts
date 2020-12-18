import {GdescriberParams} from '../types'
import * as fs from 'fs'
import * as path from 'path'
import {pascalCase} from '../util'

export const extractSQLFile: GdescriberParams['extractQueries'] = file => {
  return [
    {
      file,
      sql: fs.readFileSync(file).toString(),
      tag: pascalCase(path.parse(file).name),
    },
  ]
}
