import {dedent, relativeUnixPath} from '../util'
import * as path from 'path'
import * as fs from 'fs'
import {jsdocComment, jsdocQuery, queryInterfaces} from './typescript'
import {TaggedQuery} from '../types'
import {prettifyOne, tsPrettify} from './prettify'

export interface WriteSQLFileOptions {
  getModulePath?: (sqlPath: string) => string
}

export const defaultGetModulePathFromSQLPath: WriteSQLFileOptions['getModulePath'] = sqlPath =>
  path.join(path.dirname(sqlPath), '__sql__', path.basename(sqlPath) + '.ts')

export const getSQLHelperWriter = (getModulePath = defaultGetModulePathFromSQLPath) => (query: TaggedQuery) => {
  const destPath = getModulePath(query.file)
  const newContent = getSQLHelperContent(query, destPath)

  fs.mkdirSync(path.dirname(destPath), {recursive: true})
  fs.writeFileSync(destPath, prettifyOne({content: newContent, filepath: destPath}))
}

export function getSQLHelperContent(query: TaggedQuery, destPath: string) {
  const relPath = relativeUnixPath(query.file, path.dirname(destPath))
  const tag = query.tag

  const content = queryInterfaces([query])

  const comment = dedent(`
    Helper which reads the file system synchronously to get a query object for ${relPath}.
    (query: \`${jsdocQuery(query.sql)}\`)

    Uses \`fs\` by default and caches the result so the disk is only accessed once. You can pass in a custom \`readFileSync\` function for use-cases where disk access is not possible.

    @example
    \`\`\`
    import {createPool} from 'slonik'
    import {get${tag}QuerySync} from './path/to/${path.parse(destPath).name}'

    async function () {
      const pool = createPool('...connection string...')

      const result = await pool.query(get${tag}QuerySync())

      return result.rows.map(r => [${query.fields
        .filter(f => !f.name.match(/\W/))
        .slice(0, 2)
        .map(f => `r.${f.name}`)
        .join(', ')}])
    }
    \`\`\`
  `)

  const queryHelpers = tsPrettify(`
    ${jsdocComment([comment])}
    export const get${tag}QuerySync = ({
      readFileSync = defaultReadFileSync,
      values = []
    }: Partial<Get${tag}QuerySyncParams> = {}): TaggedTemplateLiteralInvocationType<${tag}> => ({
      sql: readFileSync(sqlPath).toString(),
      type: 'SLONIK_TOKEN_SQL',
      values,
    })

    ${jsdocComment([comment])
      .replace(/readFileSync/g, 'readFile')
      .replace(/Sync/g, 'Async')
      .replace(/sync/g, 'async')
      .replace(`get${tag}QueryAsync()`, `await get${tag}QueryAsync()`)}
    export const get${tag}QueryAync = async ({
      readFile = defaultReadFileAsync,
      values = []
    }: Partial<Get${tag}QueryAsyncParams> = {}): Promise<TaggedTemplateLiteralInvocationType<${tag}>> => ({
      sql: (await readFile(sqlPath)).toString(),
      type: 'SLONIK_TOKEN_SQL',
      values,
    })

    const sqlPath = path.join(__dirname, (${JSON.stringify(relPath)}))

    export interface Get${tag}QueryParams {
      values: any[]
    }

    export interface FileContent {
      toString(): string
    }

    export interface Get${tag}QuerySyncParams extends Get${tag}QueryParams {
      readFileSync: (filepath: string) => FileContent
    }

    export interface Get${tag}QueryAsyncParams extends Get${tag}QueryParams {
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
  `)

  const newContent = tsPrettify(`
    import {TaggedTemplateLiteralInvocationType} from 'slonik'
    import * as path from 'path'
    import * as fs from 'fs'

    ${content}

    ${queryHelpers}
  `)
  return newContent
}
