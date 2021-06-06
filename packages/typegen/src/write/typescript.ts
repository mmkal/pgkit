import * as lodash from 'lodash'
import {tsPrettify} from './prettify'
import {TaggedQuery, AnalysedQuery} from '../types'
import * as assert from 'assert'
import {dedent, truncateQuery, simplifyWhitespace, truncate} from '../util'

export const jsdocComment = (lines: Array<string | undefined | false>) => {
  const middle = lines
    .filter(line => typeof line === 'string')
    .join('\n\n')
    .trim()
    .split('\n')
    .map(line => `* ${line}`)
    .join('\n')

  return middle.includes('\n')
    ? `/**\n${middle}\n*/` // surround multiline comments with new lines
    : `/** ${middle} */`.replace('* *', '*')
}

const isValidIdentifier = (key: string) => !key.match(/\W/)

export const quotePropKey = (key: string) => (key.match(/\W/) ? JSON.stringify(key) : key)

export const getterExpression = (key: string) => (isValidIdentifier(key) ? `.${key}` : `[${JSON.stringify(key)}]`)

export const interfaceBody = (query: AnalysedQuery) =>
  `{
    ${lodash
      .chain(query.fields)
      .groupBy(f => f.name)
      .values()
      .map(fields => {
        const prop = quotePropKey(fields[0].name)
        const types = lodash.uniq(
          fields.map(f =>
            f.notNull || f.typescript === 'any' || f.typescript === 'unknown'
              ? `${f.typescript}`
              : `(${f.typescript}) | null`,
          ),
        )
        const comments = lodash.flatMap(fields, f => {
          const metaVals = {
            column: f.column && Object.values(f.column).join('.'),
            'not null': f.notNull,
            regtype: f.regtype,
          }
          const meta = Object.entries(metaVals)
            .filter(e => e[1])
            .map(e => `${e[0]}: \`${e[1]}\``)
            .join(', ')

          return lodash.compact([f.comment, meta])
        })

        let type = types[0]
        if (fields.length > 1) {
          type = types.map(t => `(${t})`).join(' | ')
          comments.unshift(`Warning: ${fields.length} columns detected for field ${prop}!`)
        }
        return `
          ${jsdocComment(comments)}
          ${prop}: ${type}
        `
      })
      .join('\n')}
}`

// todo: make `comment?: string` into `comments: string[]` so that it can be tweaked, and this becomes a pure write-to-disk method.

export function renderQueryInterface(queryGroup: AnalysedQuery[], interfaceName: string) {
  const [query, ...rest] = queryGroup
  const comments =
    rest.length === 0
      ? [`- query: \`${truncateQuery(query.sql)}\``, query.comment]
      : [
          `queries:\n${queryGroup.map(q => `- \`${truncateQuery(q.sql)}\``).join('\n')}`,
          ...queryGroup.map(q => q.comment),
        ]
  const bodies = queryGroup.map(interfaceBody)

  const numBodies = new Set(bodies).size
  assert.strictEqual(numBodies, 1, `Query group ${interfaceName} produced inconsistent interface bodies: ${bodies}`)

  // This relies on src/query/parse.ts returning '_void' when there are no columns.
  // Might be worth finding a better way to determine void-ness if there are cases of 0 fields but non-void responses possible.
  const typeDef =
    interfaceName === '_void' && !bodies[0].match(/\w/g)
      ? `export type ${interfaceName} = void`
      : `export interface ${interfaceName} ${bodies[0]}`

  return `
    ${jsdocComment(comments)}
    ${typeDef}
  `
}

export function queryInterfaces(group: TaggedQuery[]) {
  const uglyContent = lodash
    .chain(group)
    .groupBy(q => q.tag)
    .map(renderQueryInterface)
    .value()
    .join('\n\n')

  return tsPrettify(uglyContent)
}
