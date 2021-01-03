import * as lodash from 'lodash'
import {AnalysedQuery, GdescriberParams} from '../types'
import {relativeUnixPath, simplifyWhitespace, truncate, tryOr} from '../util'
import {prettifyOne} from './prettify'
import type * as ts from 'typescript'
import * as fs from 'fs'
import * as path from 'path'
import {getSuggestedTags} from '../query-analysis'

// todo: pg-protocol parseError adds all the actually useful information
// to fields which don't show up in error messages. make a library which patches it to include relevant info.

const jsdocQuery = lodash.flow(simplifyWhitespace, truncate)

const jsdocComment = (lines: Array<string | undefined | false>) => {
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

export interface WriteTypeScriptFilesOptions {
  /**
   * A function determining where to write types. Receives the source file path as an input. By default, returns `sourceFilePath` unmodified.
   * When the `sourceFilePath` value is returned directly, the queries will be added as a `module` at the end of the file. If any other file
   * path is returned, its contents will be replaced with the generated query types.
   */
  getQueriesModule?: (sourceFilePath: string) => string
}

export const writeTypeScriptFiles = ({
  getQueriesModule = filepath => filepath,
}: WriteTypeScriptFilesOptions = {}): GdescriberParams['writeTypes'] => queries => {
  lodash
    .chain(queries)
    .groupBy(q => q.file)
    .mapValues((queries): null | TaggedQuery[] => {
      try {
        return addTags(queries)
      } catch (e) {
        return null
      }
    })
    .pickBy(Boolean)
    .mapValues(queries => queries!) // help the type system figure out we threw out the nulls
    .forIn(getFileWriter(getQueriesModule))
    .value()
}

interface TaggedQuery extends AnalysedQuery {
  tag: string
}

const addTags = (queries: AnalysedQuery[]): TaggedQuery[] => {
  const withIdentifiers = queries.map(q => ({...q, identifier: JSON.stringify(q.template)}))

  const tagMap = lodash
    .chain(withIdentifiers)
    .flatMap(q =>
      [...getSuggestedTags(q.template), 'Anonymous'].map((tag, _i, allTags) => ({
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

const queryInterface = (query: AnalysedQuery, interfaceName: string) => `
   ${jsdocComment([
     `- query: \`${jsdocQuery(query.sql)}\``, // break
     query.comment,
   ])}
  export interface ${interfaceName} {
    ${query.fields.map(f => {
      const type =
        f.column?.notNull || f.typescript === 'any' || f.typescript === 'unknown'
          ? `${f.typescript}`
          : `${f.typescript} | null`
      return `
          ${jsdocComment([f.column?.comment, `postgres type: ${f.gdesc}`])}
          ${JSON.stringify(f.name)}: ${type}
        `
    })}
}`

function getFileWriter(getQueriesModule: (sourceFilePath: string) => string) {
  return (group: TaggedQuery[], file: string) => {
    const ts: typeof import('typescript') = require('typescript')
    let source = fs.readFileSync(file).toString()
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2015, /*setParentNodes */ true)

    const edits: Array<{
      start: number
      end: number
      replacement: string
    }> = []

    visit(sourceFile)

    const destPath = getQueriesModule(file)
    if (destPath === file) {
      edits.push({
        start: source.length,
        end: source.length,
        replacement: queriesModule(group),
      })
    } else {
      fs.writeFileSync(destPath, queryInterfaces(group) + '\n', 'utf8')

      const importPath = relativeUnixPath(destPath, path.dirname(file))
      const importStatement = `import * as queries from '${importPath}'`

      if (!source.includes(importStatement) && !source.includes(importStatement.replace(/'/g, `"`))) {
        edits.push({
          start: 0,
          end: 0,
          replacement: importStatement + '\n',
        })
      }
    }

    lodash
      .sortBy(edits, e => -e.end)
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
  }
}

function queriesModule(group: TaggedQuery[]) {
  if (group.length === 0) {
    return ''
  }
  return `
    module queries {
      ${queryInterfaces(group)}
    }
  `
}

function queryInterfaces(group: TaggedQuery[]) {
  return lodash
    .chain(group)
    .map(q => ({
      ...q,
      typescript: queryInterface(q, 'placeholder'),
    }))
    .uniqBy(q => q.typescript)
    .map(q => queryInterface(q, q.tag))
    .value()
    .join('\n\n')
}
