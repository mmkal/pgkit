import * as fsSyncer from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import {getPoolHelper} from '@slonik/migrator/test/pool-helper'

const helper = getPoolHelper({__filename})

const gdescParams = (baseDir: string): Partial<gdesc.GdescriberParams> => ({
  rootDir: baseDir,
  pool: helper.pool,
  psqlCommand: `docker-compose exec -T postgres psql "postgresql://postgres:postgres@localhost:5432/postgres?options=--search_path%3d${helper.schemaName}"`,
})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table test_table(
      id int primary key,
      n int
    );
  `)
})

test('edit before write', async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'query1.sql': `select id, n from test_table`,
    'query2.sql': `select n as aaa from test_table`,
  })

  syncer.sync()

  await gdesc.gdescriber(gdescParams(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    query1.sql: |-
      select id, n from test_table
      
    query2.sql: |-
      select n as aaa from test_table
      
    __sql__: 
      query1.sql.ts: |-
        import {TaggedTemplateLiteralInvocationType} from 'slonik'
        import * as path from 'path'
        import * as fs from 'fs'
        
        /** - query: \`select id, n from test_table\` */
        export interface TestTable {
          /** column: \`sql_test.test_table.id\`, not null: \`true\`, postgres type: \`integer\` */
          id: number
          /** column: \`sql_test.test_table.n\`, postgres type: \`integer\` */
          n: number | null
        }
        
        /**
         * Helper which reads the file system synchronously to get a query object for ../query1.sql.
         * (query: \`select id, n from test_table\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFileSync\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
         * import {createPool} from 'slonik'
         * import {getTestTableQuerySync} from './path/to/query1.sql'
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
          values = [],
        }: Partial<GetTestTableQuerySyncParams> = {}): TaggedTemplateLiteralInvocationType<TestTable> => ({
          sql: readFileSync(sqlPath).toString(),
          type: 'SLONIK_TOKEN_SQL',
          values,
        })
        
        /**
         * Helper which reads the file system asynchronously to get a query object for ../query1.sql.
         * (query: \`select id, n from test_table\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFile\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
         * import {createPool} from 'slonik'
         * import {getTestTableQueryAasync} from './path/to/query1.sql'
         *
         * aasync function () {
         *   const pool = createPool('...connection string...')
         *
         *   const result = await pool.query(getTestTableQueryAasync())
         *
         *   return result.rows.map(r => [r.id, r.n])
         * }
         * \`\`\`
         */
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
        
      query2.sql.ts: |-
        import {TaggedTemplateLiteralInvocationType} from 'slonik'
        import * as path from 'path'
        import * as fs from 'fs'
        
        /** - query: \`select n as aaa from test_table\` */
        export interface TestTable {
          /** column: \`sql_test.test_table.n\`, postgres type: \`integer\` */
          aaa: number | null
        }
        
        /**
         * Helper which reads the file system synchronously to get a query object for ../query2.sql.
         * (query: \`select n as aaa from test_table\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFileSync\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
         * import {createPool} from 'slonik'
         * import {getTestTableQuerySync} from './path/to/query2.sql'
         *
         * async function () {
         *   const pool = createPool('...connection string...')
         *
         *   const result = await pool.query(getTestTableQuerySync())
         *
         *   return result.rows.map(r => [r.aaa])
         * }
         * \`\`\`
         */
        export const getTestTableQuerySync = ({
          readFileSync = defaultReadFileSync,
          values = [],
        }: Partial<GetTestTableQuerySyncParams> = {}): TaggedTemplateLiteralInvocationType<TestTable> => ({
          sql: readFileSync(sqlPath).toString(),
          type: 'SLONIK_TOKEN_SQL',
          values,
        })
        
        /**
         * Helper which reads the file system asynchronously to get a query object for ../query2.sql.
         * (query: \`select n as aaa from test_table\`)
         *
         * Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFile\` function for use-cases where disk access is not possible.
         *
         * @example
         * \`\`\`
         * import {createPool} from 'slonik'
         * import {getTestTableQueryAasync} from './path/to/query2.sql'
         *
         * aasync function () {
         *   const pool = createPool('...connection string...')
         *
         *   const result = await pool.query(getTestTableQueryAasync())
         *
         *   return result.rows.map(r => [r.aaa])
         * }
         * \`\`\`
         */
        export const getTestTableQueryAync = async ({
          readFile = defaultReadFileAsync,
          values = [],
        }: Partial<GetTestTableQueryAsyncParams> = {}): Promise<TaggedTemplateLiteralInvocationType<TestTable>> => ({
          sql: (await readFile(sqlPath)).toString(),
          type: 'SLONIK_TOKEN_SQL',
          values,
        })
        const sqlPath = path.join(__dirname, '../query2.sql')
        
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
        "
  `)
}, 20000)
