import {AnalysedQuery, GdescriberParams} from '../types'
import * as inline from './inline'
import * as sql from './sql'
import * as lodash from 'lodash'
import {addTags} from '../query/tag'
import * as assert from 'assert'

export interface WriteTypesOptions extends inline.WriteTypeScriptFilesOptions, sql.WriteSQLFileOptions {}

export const defaultWriteTypes = (options: WriteTypesOptions = {}): GdescriberParams['writeTypes'] => {
  const inlineWriter = inline.getFileWriter(options.getQueriesModule!)
  const sqlWriter = sql.getSQLHelperWriter(options)

  return queries => {
    return lodash
      .chain(queries)
      .groupBy(q => q.file)
      .mapValues(addTags)
      .tap(console.log)
      .pickBy(Boolean)
      .mapValues(queries => queries!) // help the type system figure out we threw out the nulls using `pickBy(Boolean)`
      .forIn((group, file) => {
        if (file.endsWith('.sql')) {
          const [query, ...rest] = group
          assert.ok(query, `SQL query should be defined for ${file}`)
          assert.strictEqual(rest.length, 0, `More than one SQL query found for ${file}`)

          sqlWriter(query)
        } else {
          inlineWriter(group, file)
        }
      })
      .value()
  }
}
