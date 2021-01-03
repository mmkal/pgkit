import * as lodash from 'lodash'
import * as fp from 'lodash/fp'
import {DescribedQuery, GdescriberParams} from '../types'
import {simplifyWhitespace, truncate, tryOr} from '../util'
import {prettifyOne} from './prettify'
import type * as ts from 'typescript'
import * as fs from 'fs'
import {getSuggestedTags, suggestedTags} from '../query-analysis'

// todo: pg-protocol parseError adds all the actually useful information
// to fields which don't show up in error messages. make a library which patches it to include relevant info.

const jsdocQuery = lodash.flow(simplifyWhitespace, truncate)

export interface WriteTypeScriptFilesOptions {
  /** Folder to write into. Note that this folder will be wiped clean. */
  folder: string
  /**
   * Modifier to add to nullable props. To be very cautious, set to `'?'`. If you do this, though,
   * a lot of fields will come back null, since postgres doesn't keep very good track of non-nullability.
   * - e.g. results from `insert into foo(x) values (1) returning x, y` will yield nulls even if columns `x` and `y` are non-nullable.
   * - e.g. results from `count(*) from foo` will yield null since functions can't have `not null` return values.
   * - e.g. `count x from foo where x is not null` will yield null.
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
}: WriteTypeScriptFilesOptions): GdescriberParams['writeTypes'] => queries => {
  lodash
    .chain(queries)
    .groupBy(q => q.file)
    .mapValues(
      tryOr(
        addTags,
        fp.map(q => ({...q, tag: '__unknown'})),
      ),
    )
    .forIn((group, file) => {
      const ts: typeof import('typescript') = require('typescript')
      let source = fs.readFileSync(file).toString()
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2015, /*setParentNodes */ true)

      const edits: Array<{
        start: number
        end: number
        replacement: string
      }> = []

      visit(sourceFile)

      edits.push({
        start: source.length,
        end: source.length,
        replacement: `
          module queries {
            ${lodash
              .chain(group)
              .map(q => ({
                ...q,
                typescript: queryResultType(q, 'placeholder'),
              }))
              .uniqBy(q => q.typescript)
              .map(q => queryResultType(q, q.tag))
              .join('\n\n')
              .value()}
          }
        `,
      })

      lodash
        .sortBy(edits, e => -e.start)
        .forEach(e => {
          source = source.slice(0, e.start) + e.replacement + source.slice(e.end)
        })

      fs.writeFileSync(file, prettifyOne({filepath: file, content: source}), 'utf8')

      function visit(node: ts.Node) {
        if (ts.isModuleDeclaration(node) && node.name.getText() === 'queries') {
          edits.push({
            start: node.getStart(sourceFile),
            end: node.getEnd(),
            replacement: '',
          })
        }

        if (ts.isTaggedTemplateExpression(node)) {
          if (ts.isIdentifier(node.tag)) {
            if (node.tag.getText() === 'sql') {
              const match = group.find(q => q.text === node.getFullText())
              if (match) {
                edits.push({
                  start: node.tag.getStart(sourceFile),
                  end: node.template.getStart(sourceFile),
                  replacement: `sql<queries.${match.tag}>`,
                })
              }
            }
          }
        }

        ts.forEachChild(node, visit)
      }
    })
    .value()
}

const addTags = (queries: DescribedQuery[]): Array<DescribedQuery & {tag: string}> => {
  const withIdentifiers = queries.map(q => ({...q, identifier: JSON.stringify(q.template)}))

  const tagMap = lodash
    .chain(withIdentifiers)
    .flatMap(q =>
      getSuggestedTags(q.template).map((tag, _i, allTags) => ({
        ...q,
        tag,
        alternatives: allTags,
      })),
    )
    .sortBy(q => q.alternatives.length)
    .map((q, i, arr) => {
      const firstWithTagIndex = lodash.findIndex(arr, o => o.tag === q.tag)
      const matchesFirstTag = arr[firstWithTagIndex].identifier === q.identifier
      return {
        ...q,
        tag: matchesFirstTag ? q.tag : q.tag + '_' + firstWithTagIndex,
        priority: matchesFirstTag ? 0 : 1,
      }
    })
    .sortBy(q => q.priority)
    .uniqBy(q => q.identifier)
    .keyBy(q => q.identifier)
    .value()

  return withIdentifiers.map(q => ({
    ...q,
    tag: tagMap[q.identifier].tag,
  }))
}

const queryResultType = (query: DescribedQuery, interfaceName: string) => `
  /**
   * - query: \`${jsdocQuery(query.sql)}\`
   */
  export interface ${interfaceName} {
    ${query.fields.map(f => {
      const typeComment = `postgres type: ${f.gdesc}`
      const comment = f.column?.comment
        ? `
          /**
           * ${f.column.comment}
           * 
           * ${typeComment}
           */
        `.trim()
        : `/** ${typeComment} */`
      return `
          ${comment}
          ${f.name}: ${f.typescript}
        `
    })}
}`
