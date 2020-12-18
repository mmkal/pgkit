import * as fs from 'fs'
import * as os from 'os'
import {GdescriberParams} from '../types'
import {simplifyWhitespace} from '../util'

/**
 * Very stupid js/ts parser which uses regexes. Will break horribly if one of these things happens:
 * - there are queries with backticks in them
 * - there are commented-out queries
 * - there are queries which use any kind of complex nesting like sql.Foo`select * from foo where name like ${`bar_%_${suffix}`}`
 *
 * If you're worried by any of the above, don't use this.
 */
export const dumbExtractQueries: GdescriberParams['extractQueries'] = file => {
  const content = fs.readFileSync(file).toString()
  return content
    .replace(/sql\.(\w+)`/g, 'start_marker:$1`')
    .split('start_marker:')
    .slice(1)
    .map(sqlPlusCruft => sqlPlusCruft.split('`'))
    .map(([tag, sql]) => ({file, tag, sql: simplifyWhitespace(sql, os.EOL)}))
}
