import {GdescriberParams} from '../types'
import * as inline from './inline'
import * as sql from './sql'
import * as lodash from 'lodash'
import {addTags} from '../query/tag'
import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'

export type WriteFile = (filepath: string, content: string) => Promise<void>

export const defaultWriteFile: WriteFile = async (filepath, content) => {
  await fs.promises.mkdir(path.dirname(filepath), {recursive: true})
  await fs.promises.writeFile(filepath, content)
}

/**
 * @experimental
 * These options are not yet stable and may be renamed/refactored/moved/removed.
 */
export interface WriteTypesOptions {
  getTSModuleFromSource?: (sourcePath: string) => string
  getTSModuleFromSQL?: (sqlPath: string) => string
  writeFile?: WriteFile
}

export const defaultWriteTypes = ({
  writeFile = defaultWriteFile,
  ...options
}: WriteTypesOptions = {}): GdescriberParams['writeTypes'] => {
  const inlineWriter = inline.getFileWriter({getQueriesModulePath: options.getTSModuleFromSource, writeFile})
  const sqlWriter = sql.getSQLHelperWriter({getModulePath: options.getTSModuleFromSQL, writeFile})

  return async queries => {
    const promises = lodash
      .chain(queries)
      .groupBy(q => q.file)
      .mapValues(addTags)
      .pickBy(Boolean)
      .mapValues(queries => queries!) // help the type system figure out we threw out the nulls using `pickBy(Boolean)`
      .map(async (group, file) => {
        if (file.endsWith('.sql')) {
          const [query, ...rest] = group
          assert.ok(query, `SQL query should be defined for ${file}`)
          assert.strictEqual(rest.length, 0, `More than one SQL query found for ${file}`)

          return sqlWriter(query)
        } else {
          return inlineWriter(group, file)
        }
      })
      .value()

    await Promise.all(promises)
  }
}
