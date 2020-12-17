import * as path from 'path'
import * as os from 'os'
import * as lodash from 'lodash'
import * as fp from 'lodash/fp'
import {fsSyncer} from 'fs-syncer'
import {DescribedQuery, GdescriberParams} from '../index'
import {simplifyWhitespace} from '../util'

export const writeTypeScriptFiles = (folder: string): GdescriberParams['writeTypes'] => groups => {
  const typeFiles = lodash
    .chain(groups)
    .mapKeys((val, typeName) => typeName.slice(0, 1).toUpperCase() + typeName.slice(1))
    .mapValues(
      fp.uniqBy(q => {
        const stringified = q.fields.map(f => JSON.stringify(f))
        return stringified.sort().join(',')
      }),
    )
    .mapValues(getQueryTypeFile)
    .mapKeys((content, name) => name + '.ts')
    .value()

  const names = Object.keys(typeFiles).map(filepath => path.parse(filepath).name)
  let allFiles: Record<string, any> = {
    types: typeFiles,
    'types.ts': typesBarrel(names),
    'index.ts': indexFile(names, groups),
  }

  try {
    const prettier: typeof import('prettier') = require('prettier')
    const prettify = (val: any, filepath: string): typeof val =>
      typeof val === 'string' ? prettier.format(val, {filepath}) : lodash.mapValues(val, prettify)
    allFiles = prettify(allFiles, '.')
  } catch (e) {
    const help =
      e?.code === 'MODULE_NOT_FOUND' ? `Install prettier to fix this. ${e.message}` : `Error below:\n${e.message}`
    console.warn(`prettier failed to run; Your output will be very ugly! ${help}`)
  }

  fsSyncer(folder, allFiles).sync()
}

const getQueryTypeFile = (queries: DescribedQuery[], typeName: string) => {
  if (queries.length === 1) {
    return queryResultType(queries[0], typeName)
  }
  const interfaces = queries.map((q, i) => queryResultType(q, `${typeName}_${i}`))

  const allKeys = [...new Set(queries.flatMap(q => q.fields.map(f => f.name)))]
  const intersectionKeys = lodash.intersection(...queries.map(q => q.fields.map(f => f.name)))
  const inconsistentKeys = lodash.difference(allKeys, intersectionKeys)

  const unionType = queries.map((q, i) => `${typeName}_${i}`).join(' | ')

  const inconsistentKeysWarning =
    inconsistentKeys.length > 0
      ? `
        /**
         * ⚠️⚠️⚠️ WARNING! ⚠️⚠️⚠️
         *
         * There are ${queries.length} separate queries for \`${typeName}\`, so the usable type is a union.
         * This means the following keys are _not_ available since they don't appear in all queries:
         *
         ${inconsistentKeys.map(name => `* - \`${name}\``).join(os.EOL)}
         *
         * To avoid this, use different type names for queries returning different fields.
         */
      `.trim()
      : ''

  return `
    ${inconsistentKeysWarning}
    export type ${typeName} = {
      [K in keyof ${typeName}_Union]: ${typeName}_Union[K]
    }

    ${inconsistentKeysWarning}
    export type ${typeName}_Union = ${unionType}

    ${interfaces.join(os.EOL + os.EOL)}
  `
}

const queryResultType = (query: DescribedQuery, interfaceName: string) => `
  /**
   * - query: \`${simplifyWhitespace(query.sql)}\`
   * - file: ${query.file}
   */
  export interface ${interfaceName} {
    ${query.fields.map(
      f => `
      /** postgres type: ${f.gdesc} */
      ${f.name}: ${f.typescript}
    `,
    )}
}`

function indexFile(names: string[], groups: Record<string, DescribedQuery[]>): any {
  return `
    import * as slonik from 'slonik'
    import * as types from './types'

    export { types }

    export interface GenericSqlTaggedTemplateType<T> {
      <U = T>(
        template: TemplateStringsArray,
        ...vals: slonik.ValueExpressionType[]
      ): slonik.TaggedTemplateLiteralInvocationType<U>
    }
    
    export type SqlType = typeof slonik.sql & {
      ${names.map(
        n => `
          /**
           * Template tag for queries returning \`${n}\`
           ${groups[n]?.map(g =>
             `
              *
              * @example
              * \`\`\`
              * await connection.query(sql.${n}\`
              *   ${simplifyWhitespace(g.sql)}
              * \`)
              * \`\`\`
              `.trim(),
           )}
            */
          ${n}: GenericSqlTaggedTemplateType<types.${n}>
        `,
      )}
    };

    /**
     * Wrapper for \`slonik.sql\` with properties for types ${names.map(n => '`' + n + '`').join(', ')}
     * 
     * @example
     * \`\`\`
     * const result = await connection.query(sql.${names[0] || 'Example'}\`
     *  ${simplifyWhitespace(groups[Object.keys(groups)[0]]?.[0]?.sql || 'select foo, bar from baz')}
     * \`)
     * 
     * result.rows.forEach(row => {
     *   // row is strongly-typed
     * })
     * \`\`\`
     * 
     * It can also be used as a drop-in replacement for \`slonik.sql\`, the type tags are optional:
     * 
     * @example
     * \`\`\`
     * const result = await connection.query(sql\`
     *   select foo, bar from baz
     * \`)
     * 
     * result.rows.forEach(row => {
     *   // row is not strongly-typed, but you can still use it!
     * })
     * \`\`\`
     */
    export const sql: SqlType = Object.assign(
      // wrapper function for \`slonik.sql\`
      (...args: Parameters<typeof slonik.sql>): ReturnType<typeof slonik.sql> => {
        return slonik.sql(...args)
      },
      // attach helpers (\`sql.join\`, \`sql.unnest\` etc.) to wrapper function
      slonik.sql,
      // attach type tags
      {
        ${names.map(n => `${n}: slonik.sql`)}
      }
    )
  `
}

function typesBarrel(names: string[]): any {
  return `
      ${names.map(n => `import { ${n} } from './types/${n}'`).join(os.EOL)}

      ${names.map(n => `export { ${n} }`).join(os.EOL)}
    `
}
