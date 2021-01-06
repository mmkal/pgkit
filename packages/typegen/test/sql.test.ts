import * as fsSyncer from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import {getHelper} from './helper'

export const {gdescParams, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table test_table(
      id int primary key,
      n int
    );
  `)
})

test('types for sql files', async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'test-table1.sql': `select id, n from test_table`,
    'test-table2.sql': `select n as aaa from test_table`,
  })

  syncer.sync()

  await gdesc.gdescriber(gdescParams(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    test-table1.sql: |-
      select id, n from test_table
      
    test-table2.sql: |-
      select n as aaa from test_table
      
    __sql__: 
      test-table1.sql.ts: |-
        import {TaggedTemplateLiteralInvocationType} from 'slonik'
        import * as path from 'path'
        import * as fs from 'fs'
        
        /** - query: \`select id, n from test_table\` */
        export interface TestTable1 {
          /** column: \`sql_test.test_table.id\`, not null: \`true\`, postgres type: \`integer\` */
          id: number
        
          /** column: \`sql_test.test_table.n\`, postgres type: \`integer\` */
          n: number | null
        }
        
        /**
         * Helper which reads the file system synchronously to get a query object for ../test-table1.sql.
         * (query: \`select id, n from test_table\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFileSync\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
         * import {createPool} from 'slonik'
         * import {getTestTable1QuerySync} from './path/to/test-table1.sql'
         *
         * async function () {
         *   const pool = createPool('...connection string...')
         *
         *   const result = await pool.query(getTestTable1QuerySync())
         *
         *   return result.rows.map(r => [r.id, r.n])
         * }
         * \`\`\`
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
         * (query: \`select id, n from test_table\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFile\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
         * import {createPool} from 'slonik'
         * import {getTestTable1QueryAsync} from './path/to/test-table1.sql'
         *
         * async function () {
         *   const pool = createPool('...connection string...')
         *
         *   const result = await pool.query(await getTestTable1QueryAsync())
         *
         *   return result.rows.map(r => [r.id, r.n])
         * }
         * \`\`\`
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
        
        export const defaultReadFileSync: GetTestTable1QuerySyncOptions['readFileSync'] = (filepath: string) => {
          const cached = _queryCache.get(filepath)
          if (cached) {
            return cached
          }
          const content = fs.readFileSync(filepath).toString()
          _queryCache.set(filepath, content)
          return content
        }
        
        export const defaultReadFileAsync: GetTestTable1QueryAsyncOptions['readFile'] = async (filepath: string) => {
          const cached = _queryCache.get(filepath)
          if (cached) {
            return cached
          }
          const content = (await fs.promises.readFile(filepath)).toString()
          _queryCache.set(filepath, content)
          return content
        }
        
      test-table2.sql.ts: |-
        import {TaggedTemplateLiteralInvocationType} from 'slonik'
        import * as path from 'path'
        import * as fs from 'fs'
        
        /** - query: \`select n as aaa from test_table\` */
        export interface TestTable2 {
          /** column: \`sql_test.test_table.n\`, postgres type: \`integer\` */
          aaa: number | null
        }
        
        /**
         * Helper which reads the file system synchronously to get a query object for ../test-table2.sql.
         * (query: \`select n as aaa from test_table\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFileSync\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
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
         * \`\`\`
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
         * (query: \`select n as aaa from test_table\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFile\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
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
         * \`\`\`
         */
        export const getTestTable2QueryAync = async ({
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
        
        export const defaultReadFileSync: GetTestTable2QuerySyncOptions['readFileSync'] = (filepath: string) => {
          const cached = _queryCache.get(filepath)
          if (cached) {
            return cached
          }
          const content = fs.readFileSync(filepath).toString()
          _queryCache.set(filepath, content)
          return content
        }
        
        export const defaultReadFileAsync: GetTestTable2QueryAsyncOptions['readFile'] = async (filepath: string) => {
          const cached = _queryCache.get(filepath)
          if (cached) {
            return cached
          }
          const content = (await fs.promises.readFile(filepath)).toString()
          _queryCache.set(filepath, content)
          return content
        }
        "
  `)
})

test('sql with parameters', async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'test-table.sql': `select id, n from test_table where id = $1 and n = $2`,
  })

  syncer.sync()

  await gdesc.gdescriber(gdescParams(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    test-table.sql: |-
      select id, n from test_table where id = $1 and n = $2
      
    __sql__: 
      test-table.sql.ts: |-
        import {TaggedTemplateLiteralInvocationType} from 'slonik'
        import * as path from 'path'
        import * as fs from 'fs'
        
        /** - query: \`select id, n from test_table where id = $1 and n = $2\` */
        export interface TestTable {
          /** postgres type: \`integer\` */
          id: number | null
        
          /** postgres type: \`integer\` */
          n: number | null
        }
        
        /**
         * Helper which reads the file system synchronously to get a query object for ../test-table.sql.
         * (query: \`select id, n from test_table where id = $1 and n = $2\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFileSync\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
         * import {createPool} from 'slonik'
         * import {getTestTableQuerySync} from './path/to/test-table.sql'
         *
         * async function () {
         *   const pool = createPool('...connection string...')
         *
         *   const result = await pool.query(getTestTableQuerySync())
         *
         *   return result.rows.map(r => [r.id, r.n])
         * }
         * \`\`\`
         */
        export const getTestTableQuerySync = ({
          readFileSync = defaultReadFileSync,
          params,
        }: GetTestTableQuerySyncOptions): TaggedTemplateLiteralInvocationType<TestTable> => ({
          sql: readFileSync(sqlPath).toString(),
          type: 'SLONIK_TOKEN_SQL',
          values: [params['$1'], params['$2']],
        })
        
        /**
         * Helper which reads the file system asynchronously to get a query object for ../test-table.sql.
         * (query: \`select id, n from test_table where id = $1 and n = $2\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFile\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
         * import {createPool} from 'slonik'
         * import {getTestTableQueryAsync} from './path/to/test-table.sql'
         *
         * async function () {
         *   const pool = createPool('...connection string...')
         *
         *   const result = await pool.query(await getTestTableQueryAsync())
         *
         *   return result.rows.map(r => [r.id, r.n])
         * }
         * \`\`\`
         */
        export const getTestTableQueryAync = async ({
          readFile = defaultReadFileAsync,
          params,
        }: GetTestTableQueryAsyncOptions): Promise<TaggedTemplateLiteralInvocationType<TestTable>> => ({
          sql: (await readFile(sqlPath)).toString(),
          type: 'SLONIK_TOKEN_SQL',
          values: [params['$1'], params['$2']],
        })
        const sqlPath = path.join(__dirname, '../test-table.sql')
        
        export interface FileContent {
          toString(): string
        }
        
        export interface GetTestTableQueryParams {
          $1: number
          $2: number
        }
        
        export interface GetTestTableQuerySyncOptions {
          readFileSync?: (filepath: string) => FileContent
          params: GetTestTableQueryParams
        }
        
        export interface GetTestTableQueryAsyncOptions {
          readFile?: (filepath: string) => Promise<FileContent>
          params: GetTestTableQueryParams
        }
        
        export const _queryCache = new Map<string, string>()
        
        export const defaultReadFileSync: GetTestTableQuerySyncOptions['readFileSync'] = (filepath: string) => {
          const cached = _queryCache.get(filepath)
          if (cached) {
            return cached
          }
          const content = fs.readFileSync(filepath).toString()
          _queryCache.set(filepath, content)
          return content
        }
        
        export const defaultReadFileAsync: GetTestTableQueryAsyncOptions['readFile'] = async (filepath: string) => {
          const cached = _queryCache.get(filepath)
          if (cached) {
            return cached
          }
          const content = (await fs.promises.readFile(filepath)).toString()
          _queryCache.set(filepath, content)
          return content
        }
        "
  `)
})
