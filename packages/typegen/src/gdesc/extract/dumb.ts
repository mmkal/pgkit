import * as fs from 'fs'
import * as os from 'os'
import {GdescriberParams} from '../types'
import {simplifyWhitespace} from '../util'

export const dumbExtractQueries: GdescriberParams['extractQueries'] = file => {
  const content = fs.readFileSync(file).toString()
  return content
    .replace(/sql\.(\w+)`/g, 'start_marker:$1`')
    .split('start_marker:')
    .slice(1)
    .map(sqlPlusCruft => sqlPlusCruft.split('`'))
    .map(([tag, sql]) => ({file, tag, sql: simplifyWhitespace(sql, os.EOL)}))
}
