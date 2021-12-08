import * as lodash from 'lodash'
import {TaggedQuery} from '../types'
import {relativeUnixPath} from '../util'
import {tsPrettify} from './prettify'
import type * as ts from 'typescript'
import * as path from 'path'
import {queryInterfaces} from './typescript'
import {WriteFile} from '.'

// todo: pg-protocol parseError adds all the actually useful information
// to fields which don't show up in error messages. make a library which patches it to include relevant info.

export const defaultGetQueriesModule = (filepath: string) => filepath

export interface WriteTSFileOptions {
  getQueriesModulePath?: (sqlPath: string) => string
  writeFile: WriteFile
}

interface Edit {
  start: number
  end: number
  replacement: string
}

const applyEdits = (input: string, edits: Edit[]) =>
  lodash.sortBy(edits, e => e.end).reduceRight((s, e) => s.slice(0, e.start) + e.replacement + s.slice(e.end), input)

export function getFileWriter({getQueriesModulePath = defaultGetQueriesModule, writeFile}: WriteTSFileOptions) {
  return async (group: TaggedQuery[], file: string) => {
    const ts: typeof import('typescript') = require('typescript')
    const originalSource = group[0].source
    const sourceFile = ts.createSourceFile(file, originalSource, ts.ScriptTarget.ES2015, /*setParentNodes */ true)

    const edits: Array<Edit> = []

    visit(sourceFile)

    const destPath = getQueriesModulePath(file)
    if (destPath === file) {
      edits.push({
        start: originalSource.length,
        end: originalSource.length,
        replacement: queriesModule(group),
      })
    } else {
      let content = queryInterfaces(group)
      await writeFile(destPath, content)

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

    await writeFile(file, newSource)

    function visit(node: ts.Node) {
      if (ts.isModuleDeclaration(node) && node.name.getText() === 'queries') {
        edits.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          replacement: '',
        })
      }

      if (ts.isTaggedTemplateExpression(node)) {
        const isSqlIdentifier = (n: ts.Node) => ts.isIdentifier(n) && n.getText() === 'sql'
        const sqlPropertyAccessor = ts.isPropertyAccessExpression(node.tag) && isSqlIdentifier(node.tag.name)
        if (isSqlIdentifier(node.tag) || sqlPropertyAccessor) {
          const match = group.find(q => q.text === node.getFullText())
          if (match) {
            edits.push({
              start: node.tag.getStart(sourceFile),
              end: node.template.getStart(sourceFile),
              replacement: `${node.tag.getText()}<queries.${match.tag}>`,
            })
          }
        }
      }

      ts.forEachChild(node, visit)
    }
  }
}

function queriesModule(group: TaggedQuery[]) {
  const uglyContent = `
    export declare namespace queries {
      ${queryInterfaces(group)}
    }
  `

  return '\n' + tsPrettify(uglyContent)
}
