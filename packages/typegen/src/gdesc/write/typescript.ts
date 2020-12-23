import * as path from 'path'
import * as os from 'os'
import * as lodash from 'lodash'
import * as fp from 'lodash/fp'
import {fsSyncer} from 'fs-syncer'
import {DescribedQuery, GdescriberParams} from '../types'
import {relativeUnixPath, simplifyWhitespace, truncate} from '../util'
import {prettify} from './prettify'

// todo: instead of having global types which might overlap, and needing to change sql`select * from message` to sql.Message`select * from message`
// dynamically change the `import {sql} from 'slonik'` to `import {sql} from '../generated/db/queries.message-query'` which has the exact types needed.
// maybe.

const jsdocQuery = (query: string) => truncate(simplifyWhitespace(query))

export interface WriteTypeScriptFilesOptions {
  /** Folder to write into. Note that this folder will be wiped clean. */
  folder: string
  /**
   * Modifier to add to nullable props. To be very cautious, set to `'?'`. If you do this, though,
   * a lot of fields will come back null, since postgres doesn't keep very good track of non-nullability.
   * e.g. results from `insert into foo(x) values (1) returning x, y` will yield nulls even if columns `x` and `y` are non-nullable.
   * e.g. results from `count (*) from foo` will yield null since functions can't have `not null` return values.
   * e.g. `count x from foo where x is not null` will yield null.
   */
  nullablePropModifier?: '' | '?'
}

export const writeTypeScriptFiles = ({
  folder,
  // todo: make the default `?` once common cases are correctly picked up as not null:
  // 1. `select foo, bar from baz` or `select * from baz`. See view.sql
  // 2. `insert into foo(id) values ('bar')` or `update ...`. Might require query parsing, and converting to a fake `select`.
  // 3. (maybe) common functions like `count(...)`.
  nullablePropModifier = '',
}: WriteTypeScriptFilesOptions): GdescriberParams['writeTypes'] => groups => {
  const typeFiles = lodash
    .chain(groups)
    .mapKeys((val, typeName) => typeName.slice(0, 1).toUpperCase() + typeName.slice(1))
    .mapValues(
      fp.uniqBy(q => {
        const stringified = q.fields.map(f => JSON.stringify(f))
        return stringified.sort().join(',')
      }),
    )
    .mapValues(queries =>
      queries.map(q => ({
        ...q,
        fields: q.fields.map(f =>
          f.column?.notNull
            ? f // if we *know* it's not null, don't add the modifier
            : {...f, name: f.name + nullablePropModifier},
        ),
      })),
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

  allFiles = prettify(allFiles)

  fsSyncer(folder, allFiles).sync()
}

const getQueryTypeFile = (queries: DescribedQuery[], typeName: string) => {
  if (queries.length === 1) {
    return queryResultType(queries[0], typeName)
  }
  const interfaces = queries.map((q, i) => queryResultType(q, `${typeName}_${i}`))

  const keyLists = queries.map(q => q.fields.map(f => f.name))
  const allKeys = [...new Set(keyLists.flat())]
  const intersectionKeys = lodash.intersection(...keyLists)
  const inconsistentKeys = lodash.difference(allKeys, intersectionKeys)

  const unionType = queries.map((q, i) => `${typeName}_${i}`).join(' | ')

  const inconsistentKeysWarning =
    inconsistentKeys.length === 0
      ? ''
      : `
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
   * - query: \`${jsdocQuery(query.sql)}\`
   * - file: ${relativeUnixPath(query.file)}
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
              *   ${jsdocQuery(g.sql)}
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
     *  ${jsdocQuery(groups[Object.keys(groups)[0]]?.[0]?.sql || 'select foo, bar from baz')}
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

      ${names.length === 0 ? 'export const noTypesFound = "No types found!"' : ''}
    `
}
