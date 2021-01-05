import {TaggedTemplateLiteralInvocationType} from 'slonik'
import * as path from 'path'
import * as fs from 'fs'

/** - query: `select id, n from test_table` */
export interface TestTable {
  /** column: `sql_test.test_table.id`, not null: `true`, postgres type: `integer` */
  id: number
  /** column: `sql_test.test_table.n`, postgres type: `integer` */
  n: number | null
}

export const getTestTableQuerySync = ({
  readFileSync = defaultReadFileSync,
  values = [],
}: Partial<GetTestTableQuerySyncParams> = {}): TaggedTemplateLiteralInvocationType<TestTable> => ({
  sql: readFileSync(sqlPath).toString(),
  type: 'SLONIK_TOKEN_SQL',
  values,
})

export const getTestTableQueryAync = async ({
  readFile = defaultReadFileAsync,
  values = [],
}: Partial<GetTestTableQueryAsyncParams> = {}): Promise<TaggedTemplateLiteralInvocationType<TestTable>> => ({
  sql: (await readFile(sqlPath)).toString(),
  type: 'SLONIK_TOKEN_SQL',
  values,
})
const sqlPath = path.join(__dirname, '../query1.sql')

export interface GetTestTableQueryParams {
  values: any[]
}

export interface FileContent {
  toString(): string
}

export interface GetTestTableQuerySyncParams extends GetTestTableQueryParams {
  readFileSync: (filepath: string) => FileContent
}

export interface GetTestTableQueryAsyncParams extends GetTestTableQueryParams {
  readFile: (filepath: string) => Promise<FileContent>
}

export const _queryCache = new Map<string, string>()

export const defaultReadFileSync: GetTestTableQuerySyncParams['readFileSync'] = (filepath: string) => {
  const cached = _queryCache.get(filepath)
  if (cached) {
    return cached
  }
  const content = fs.readFileSync(filepath).toString()
  _queryCache.set(filepath, content)
  return content
}

export const defaultReadFileAsync: GetTestTableQueryAsyncParams['readFile'] = async (filepath: string) => {
  const cached = _queryCache.get(filepath)
  if (cached) {
    return cached
  }
  const content = (await fs.promises.readFile(filepath)).toString()
  _queryCache.set(filepath, content)
  return content
}
