import {TaggedTemplateLiteralInvocationType} from 'slonik'
import * as path from 'path'
import * as fs from 'fs'

/** - query: `select n as aaa from test_table` */
export interface TestTable2 {
  /** column: `sql_test.test_table.n`, postgres type: `integer` */
  aaa: number | null
}

/**
 * Helper which reads the file system synchronously to get a query object for ../test-table2.sql.
 * (query: `select n as aaa from test_table`)
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
}: GetTestTable2QuerySyncParams = {}): TaggedTemplateLiteralInvocationType<TestTable2> => ({
  sql: readFileSync(sqlPath).toString(),
  type: 'SLONIK_TOKEN_SQL',
  values: [],
})

/**
 * Helper which reads the file system asynchronously to get a query object for ../test-table2.sql.
 * (query: `select n as aaa from test_table`)
 *
 * Uses `fs` by default and caches the result so the disk is only accessed once. You can pass in a custom `readFile` function for use-cases where disk access is not possible.
 *
 * @example
 * ```
 * import {createPool} from 'slonik'
 * import {getTestTable2QueryAasync} from './path/to/test-table2.sql'
 *
 * aasync function () {
 *   const pool = createPool('...connection string...')
 *
 *   const result = await pool.query(getTestTable2QueryAasync())
 *
 *   return result.rows.map(r => [r.aaa])
 * }
 * ```
 */
export const getTestTable2QueryAync = async ({
  readFile = defaultReadFileAsync,
}: GetTestTable2QueryAsyncParams = {}): Promise<TaggedTemplateLiteralInvocationType<TestTable2>> => ({
  sql: (await readFile(sqlPath)).toString(),
  type: 'SLONIK_TOKEN_SQL',
  values: [],
})
const sqlPath = path.join(__dirname, '../test-table2.sql')

export interface GetTestTable2QueryParams {}

export interface FileContent {
  toString(): string
}

export interface GetTestTable2QuerySyncParams extends GetTestTable2QueryParams {
  readFileSync?: (filepath: string) => FileContent
}

export interface GetTestTable2QueryAsyncParams extends GetTestTable2QueryParams {
  readFile?: (filepath: string) => Promise<FileContent>
}

export const _queryCache = new Map<string, string>()

export const defaultReadFileSync: GetTestTable2QuerySyncParams['readFileSync'] = (filepath: string) => {
  const cached = _queryCache.get(filepath)
  if (cached) {
    return cached
  }
  const content = fs.readFileSync(filepath).toString()
  _queryCache.set(filepath, content)
  return content
}

export const defaultReadFileAsync: GetTestTable2QueryAsyncParams['readFile'] = async (filepath: string) => {
  const cached = _queryCache.get(filepath)
  if (cached) {
    return cached
  }
  const content = (await fs.promises.readFile(filepath)).toString()
  _queryCache.set(filepath, content)
  return content
}
