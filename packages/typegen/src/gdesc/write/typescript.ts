import * as lodash from 'lodash'
import {tsPrettify} from './prettify'
import {TaggedQuery, AnalysedQuery} from '../types'
import * as assert from 'assert'
import {dedent, simplifyWhitespace, truncate} from '../util'

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

export const quotePropKey = (key: string) => (key.match(/\W/) ? JSON.stringify(key) : key)

export const interfaceBody = (query: AnalysedQuery) =>
  `{
    ${query.fields
      .map(f => {
        const prop = quotePropKey(f.name)
        const type =
          f.notNull || f.typescript === 'any' || f.typescript === 'unknown'
            ? `${f.typescript}`
            : `(${f.typescript}) | null`

        const meta = Object.entries({column: f.column, 'not null': f.notNull, 'postgres type': f.gdesc})
          .filter(e => e[1])
          .map(e => `${e[0]}: \`${e[1]}\``)
          .join(', ')

        return `
          ${jsdocComment([f.comment, meta])}
          ${prop}: ${type}
        `
      })
      .join('\n')}
}`

export const jsdocQuery = lodash.flow(simplifyWhitespace, truncate)

// todo: make `comment?: string` into `comments: string[]` so that it can be tweaked, and this becomes a pure write-to-disk method.

export function renderQueryInterface(queryGroup: AnalysedQuery[], interfaceName: string) {
  const [query, ...rest] = queryGroup
  const comments =
    rest.length === 0
      ? [`- query: \`${jsdocQuery(query.sql)}\``, query.comment]
      : [`queries:\n${queryGroup.map(q => `- \`${jsdocQuery(q.sql)}\``).join('\n')}`, ...queryGroup.map(q => q.comment)]
  const bodies = queryGroup.map(interfaceBody)

  const numBodies = new Set(bodies).size
  assert.strictEqual(numBodies, 1, `Query group ${interfaceName} produced inconsistent interface bodies: ${bodies}`)

  return `
    ${jsdocComment(comments)}
     export interface ${interfaceName} ${bodies[0]}
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
