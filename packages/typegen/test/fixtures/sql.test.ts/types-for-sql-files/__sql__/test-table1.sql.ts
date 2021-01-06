import {TaggedTemplateLiteralInvocationType} from 'slonik'
import * as path from 'path'
import * as fs from 'fs'

/** - query: `select a, b from test_table` */
export interface TestTable1 {
  /** column: `sql_test.test_table.a`, not null: `true`, postgres type: `integer` */
  a: number

  /** column: `sql_test.test_table.b`, postgres type: `text` */
  b: string | null
}

/**
 * Helper which reads the file system synchronously to get a query object for ../test-table1.sql.
 * (query: `select a, b from test_table`)
 *
 * Uses `fs` by default and caches the result so the disk is only accessed once. You can pass in a custom `readFileSync` function for use-cases where disk access is not possible.
 *
 * @example
 * ```
 * import {createPool} from 'slonik'
 * import {getTestTable1QuerySync} from './path/to/test-table1.sql'
 *
 * async function () {
 *   const pool = createPool('...connection string...')
 *
 *   const result = await pool.query(getTestTable1QuerySync())
 *
 *   return result.rows.map(r => [r.a, r.b])
 * }
 * ```
 */
export const getTestTable1QuerySync = ({
  readFileSync = defaultReadFileSync,
}: GetTestTable1QuerySyncOptions = {}): TaggedTemplateLiteralInvocationType<TestTable1> => ({
  sql: readFileSync(sqlPath).toString(),
  type: 'SLONIK_TOKEN_SQL',
  values: [],
})

/**
 * Helper which reads the file system asynchronously to get a query object for ../test-table1.sql.
 * (query: `select a, b from test_table`)
 *
 * Uses `fs` by default and caches the result so the disk is only accessed once. You can pass in a custom `readFile` function for use-cases where disk access is not possible.
 *
 * @example
 * ```
 * import {createPool} from 'slonik'
 * import {getTestTable1QueryAsync} from './path/to/test-table1.sql'
 *
 * async function () {
 *   const pool = createPool('...connection string...')
 *
 *   const result = await pool.query(await getTestTable1QueryAsync())
 *
 *   return result.rows.map(r => [r.a, r.b])
 * }
 * ```
 */
export const getTestTable1QueryAync = async ({
  readFile = defaultReadFileAsync,
}: GetTestTable1QueryAsyncOptions = {}): Promise<TaggedTemplateLiteralInvocationType<TestTable1>> => ({
  sql: (await readFile(sqlPath)).toString(),
  type: 'SLONIK_TOKEN_SQL',
  values: [],
})
const sqlPath = path.join(__dirname, '../test-table1.sql')

export interface FileContent {
  toString(): string
}

export interface GetTestTable1QuerySyncOptions {
  readFileSync?: (filepath: string) => FileContent
}

export interface GetTestTable1QueryAsyncOptions {
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
