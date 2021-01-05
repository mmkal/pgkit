import * as lodash from 'lodash'
import {GdescriberParams, TaggedQuery} from '../types'
import {relativeUnixPath} from '../util'
import {prettifyOne, tsPrettify} from './prettify'
import type * as ts from 'typescript'
import * as fs from 'fs'
import * as path from 'path'
import {addTags} from '../query/tag'
import {queryInterfaces} from './typescript'

// todo: pg-protocol parseError adds all the actually useful information
// to fields which don't show up in error messages. make a library which patches it to include relevant info.

export interface WriteTypeScriptFilesOptions {
  /**
   * A function determining where to write types. Receives the source file path as an input. By default, returns `sourceFilePath` unmodified.
   * When the `sourceFilePath` value is returned directly, the queries will be added as a `module` at the end of the file. If any other file
   * path is returned, its contents will be replaced with the generated query types.
   */
  getQueriesModule?: (sourceFilePath: string) => string
}

export const defaultGetQueriesModule = (filepath: string) =>
  filepath.endsWith('.ts') ? filepath : path.join(path.dirname(filepath), '__sql__', path.basename(filepath) + '.ts')

export const writeTypeScriptFiles = ({
  getQueriesModule = defaultGetQueriesModule,
}: WriteTypeScriptFilesOptions = {}): GdescriberParams['writeTypes'] => queries => {
  lodash
    .chain(queries)
    .groupBy(q => q.file)
    .mapValues(addTags)
    .pickBy(Boolean)
    .mapValues(queries => queries!) // help the type system figure out we threw out the nulls using `pickBy(Boolean)`
    .forIn(getFileWriter(getQueriesModule))
    .value()
}

interface Edit {
  start: number
  end: number
  replacement: string
}

const applyEdits = (input: string, edits: Edit[]) =>
  lodash.sortBy(edits, e => e.end).reduceRight((s, e) => s.slice(0, e.start) + e.replacement + s.slice(e.end), input)

export function getFileWriter(getQueriesModule: (sourceFilePath: string) => string) {
  return (group: TaggedQuery[], file: string) => {
    const ts: typeof import('typescript') = require('typescript')
    const originalSource = fs.readFileSync(file).toString()
    const sourceFile = ts.createSourceFile(file, originalSource, ts.ScriptTarget.ES2015, /*setParentNodes */ true)

    const edits: Array<Edit> = []

    visit(sourceFile)

    const destPath = getQueriesModule(file)
    if (destPath === file) {
      edits.push({
        start: originalSource.length,
        end: originalSource.length,
        replacement: queriesModule(group),
      })
    } else {
      let content = queryInterfaces(group)
      fs.mkdirSync(path.dirname(destPath), {recursive: true})
      fs.writeFileSync(destPath, prettifyOne({filepath: destPath, content}), 'utf8')

      const importPath = relativeUnixPath(destPath, path.dirname(file))
      const importStatement = `import * as queries from './${importPath.replace(/\.(js|ts|tsx)$/, '')}'`

      const importExists =
        originalSource.includes(importStatement) ||
        originalSource.includes(importStatement.replace(/'/g, `"`)) || // double quotes
        originalSource.includes(importStatement.replace('import * as', 'import')) || // synthetic default import
        originalSource.includes(importStatement.replace(/'/g, `"`).replace('import * as', 'import')) // synthetic default import with double quotes

      if (!importExists) {
        edits.push({
          start: 0,
          end: 0,
          replacement: importStatement + '\n',
        })
      }
    }

    const newSource = applyEdits(originalSource, edits)

    if (file.endsWith('.sql')) {
      // todo: write tyepscript file which links the .sql file with the query module in destPath
    } else {
      fs.writeFileSync(file, prettifyOne({filepath: file, content: newSource}), 'utf8')
    }

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
  const uglyContent = `
    module queries {
      ${queryInterfaces(group)}
    }
  `

  return '\n' + tsPrettify(uglyContent)
}
