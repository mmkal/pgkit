import {TaggedTemplateLiteralInvocationType} from 'slonik'
import * as path from 'path'
import * as fs from 'fs'

/** - query: `select b as aaa from test_table` */
export interface TestTable2 {
  /** column: `sql_test.test_table.b`, regtype: `text` */
  aaa: string | null
}

/**
 * Helper which reads the file system synchronously to get a query object for ../test-table2.sql.
 * (query: `select b as aaa from test_table`)
 *
 * Uses `fs` by default and caches the result so the disk is only accessed once. You can pass in a custom `readFileSync` function for use-cases where disk access is not possible.
 *
 * @example
 * ```
 * import {createPool} from 'slonik'
 * import {getTestTable2QuerySync} from './path/to/test-table2.sql'
 *
 * async function () {
 *   const pool = createPool('...connection string...')
 *
 *   const result = await pool.query(getTestTable2QuerySync())
 *
 *   return result.rows.map(r => [r.aaa])
 * }
 * ```
 */
export const getTestTable2QuerySync = ({
  readFileSync = defaultReadFileSync,
}: GetTestTable2QuerySyncOptions = {}): TaggedTemplateLiteralInvocationType<TestTable2> => ({
  sql: readFileSync(sqlPath).toString(),
  type: 'SLONIK_TOKEN_SQL',
  values: [],
})

/**
 * Helper which reads the file system asynchronously to get a query object for ../test-table2.sql.
 * (query: `select b as aaa from test_table`)
 *
 * Uses `fs` by default and caches the result so the disk is only accessed once. You can pass in a custom `readFile` function for use-cases where disk access is not possible.
 *
 * @example
 * ```
 * import {createPool} from 'slonik'
 * import {getTestTable2QueryAsync} from './path/to/test-table2.sql'
 *
 * async function () {
 *   const pool = createPool('...connection string...')
 *
 *   const result = await pool.query(await getTestTable2QueryAsync())
 *
 *   return result.rows.map(r => [r.aaa])
 * }
 * ```
 */
export const getTestTable2QueryAsync = async ({
  readFile = defaultReadFileAsync,
}: GetTestTable2QueryAsyncOptions = {}): Promise<TaggedTemplateLiteralInvocationType<TestTable2>> => ({
  sql: (await readFile(sqlPath)).toString(),
  type: 'SLONIK_TOKEN_SQL',
  values: [],
})
const sqlPath = path.join(__dirname, '../test-table2.sql')

export interface FileContent {
  toString(): string
}

export interface GetTestTable2QuerySyncOptions {
  readFileSync?: (filepath: string) => FileContent
}

export interface GetTestTable2QueryAsyncOptions {
  readFile?: (filepath: string) => Promise<FileContent>
}

export const _queryCache = new Map<string, string>()

export const defaultReadFileSync = (filepath: string) => {
  const cached = _queryCache.get(filepath)
  if (cached) {
    return cached
  }
  const content = fs.readFileSync(filepath).toString()
  _queryCache.set(filepath, content)
  return content
}

export const defaultReadFileAsync = async (filepath: string) => {
  const cached = _queryCache.get(filepath)
  if (cached) {
    return cached
  }
  const content = (await fs.promises.readFile(filepath)).toString()
  _queryCache.set(filepath, content)
  return content
}
