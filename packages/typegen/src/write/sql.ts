import {dedent, relativeUnixPath, typeName, truncateQuery} from '../util'
import * as path from 'path'
import {getterExpression, jsdocComment, queryInterfaces, quotePropKey} from './typescript'
import {TaggedQuery} from '../types'
import {prettifyOne, tsPrettify} from './prettify'
import {WriteFile} from '.'

export interface WriteSQLFileOptions {
  getModulePath?: (sqlPath: string) => string
  writeFile: WriteFile
}

export const defaultGetModulePathFromSQLPath: WriteSQLFileOptions['getModulePath'] = sqlPath =>
  path.join(path.dirname(sqlPath), '__sql__', path.basename(sqlPath) + '.ts')

export const getSQLHelperWriter = ({
  getModulePath = defaultGetModulePathFromSQLPath,
  writeFile,
}: WriteSQLFileOptions) => async (query: TaggedQuery) => {
  const destPath = getModulePath(query.file)
  const newContent = getSQLHelperContent(query, destPath)

  await writeFile(destPath, prettifyOne({content: newContent, filepath: destPath}))
}

export function getSQLHelperContent(query: TaggedQuery, destPath: string) {
  query = {...query, tag: typeName(path.parse(query.file).name)}
  const relPath = relativeUnixPath(query.file, path.dirname(destPath))
  const tag = query.tag

  const content = queryInterfaces([query])

  const comment = dedent(`
    Helper which reads the file system synchronously to get a query object for ${relPath}.
    (query: \`${truncateQuery(query.sql)}\`)

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

  const defaults = {
    valuesParam: 'params',
    paramsObj: '',
    sqlTokenValueProp: `values: [${query.parameters.map(p => `params${getterExpression(p.name)}`).join(', ')}]`,
    paramsInterface: `export interface Get${tag}QueryParams {
      ${query.parameters.map(p => `${quotePropKey(p.name)}: ${p.typescript}`).join('\n')}
    }`,
    paramsProp: `params: Get${tag}QueryParams`,
  }

  if (query.parameters.length === 0) {
    defaults.valuesParam = ''
    defaults.paramsObj = '= {}'
    defaults.sqlTokenValueProp = 'values: []'
    defaults.paramsInterface = ''
    defaults.paramsProp = ''
  }

  const queryHelpers = tsPrettify(`
    ${jsdocComment([comment])}
    export const get${tag}QuerySync = ({
      readFileSync = defaultReadFileSync,
      ${defaults.valuesParam}
    }: Get${tag}QuerySyncOptions ${defaults.paramsObj}): TaggedTemplateLiteralInvocationType<${tag}['@result']> => ({
      sql: readFileSync(sqlPath).toString(),
      type: 'SLONIK_TOKEN_SQL',
      ${defaults.sqlTokenValueProp},
    })

    ${jsdocComment([comment])
      .replace(/readFileSync/g, 'readFile')
      .replace(/Sync/g, 'Async')
      .replace(/\bsync/g, 'async')
      .replace(`get${tag}QueryAsync()`, `await get${tag}QueryAsync()`)}
    export const get${tag}QueryAsync = async ({
      readFile = defaultReadFileAsync,
      ${defaults.valuesParam}
    }: Get${tag}QueryAsyncOptions ${
    defaults.paramsObj
  }): Promise<TaggedTemplateLiteralInvocationType<${tag}['@result']>> => ({
      sql: (await readFile(sqlPath)).toString(),
      type: 'SLONIK_TOKEN_SQL',
      ${defaults.sqlTokenValueProp},
    })

    const sqlPath = path.join(__dirname, (${JSON.stringify(relPath)}))

    export interface FileContent {
      toString(): string
    }

    ${defaults.paramsInterface}

    export interface Get${tag}QuerySyncOptions {
      readFileSync?: (filepath: string) => FileContent
      ${defaults.paramsProp}
    }

    export interface Get${tag}QueryAsyncOptions {
      readFile?: (filepath: string) => Promise<FileContent>
      ${defaults.paramsProp}
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
