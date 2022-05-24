import * as path from 'path'

import * as lodash from 'lodash'
import type * as ts from 'typescript'

import {TaggedQuery} from '../types'
import {relativeUnixPath, tsCustom} from '../util'
import {tsPrettify} from './prettify'
import {queryInterfaces} from './typescript'
import {WriteFile} from '.'

// todo: pg-protocol parseError adds all the actually useful information
// to fields which don't show up in error messages. make a library which patches it to include relevant info.

const queryNamespace = 'queries' // todo: at some point we might want to make this configurable

const importVariations = [
  'import * as',
  'import', // synthetic default import
  'import type * as', // type-only import
  'import type', // type-only synthetic default import
]

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

    visitRecursive(sourceFile)

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
      const importPathNoExtension = importPath.replace(/\.(js|ts|tsx)$/, '')

      const importStatementVariations = [
        ...importVariations.map(imps => `${imps} ${queryNamespace} from './${importPathNoExtension}'`), // single quotes
        ...importVariations.map(imps => `${imps} ${queryNamespace} from "./${importPathNoExtension}"`), // double quotes
      ]

      const importExists = importStatementVariations.some(imp => originalSource.includes(imp))

      if (!importExists) {
        edits.push({
          start: 0,
          end: 0,
          replacement: `import * as ${queryNamespace} from './${importPathNoExtension}'\n`,
        })
      }
    }

    const newSource = applyEdits(originalSource, edits)

    await writeFile(file, newSource)

    function visitRecursive(node: ts.Node) {
      if (ts.isModuleDeclaration(node) && node.name.getText() === queryNamespace) {
        // remove old import(s) (will get re-added later)
        edits.push({
          start: node.getStart(sourceFile),
          end: node.getEnd(),
          replacement: '',
        })
        return
      }

      if (ts.isTaggedTemplateExpression(node)) {
        if (!tsCustom.isSqlLiteral(node)) {
          return
        }
        const matchingQuery = group.find(q => q.text === node.getFullText())
        if (!matchingQuery) {
          return
        }
        const typeReference = `${queryNamespace}.${matchingQuery.tag}`
        if (node.typeArguments && node.typeArguments.length === 1) {
          // existing type definitions
          const [typeNode] = node.typeArguments
          if (ts.isIntersectionTypeNode(typeNode)) {
            // preserve intersection types
            const [firstArg] = typeNode.types // Always overwrite the first type in the intersection, leave all subsequent ones alone.
            edits.push({
              start: firstArg.getStart(sourceFile),
              end: firstArg.getEnd(),
              replacement: typeReference,
            })
            return
          }
        }
        // default: replace complete tag to add/overwrite type arguments
        edits.push({
          start: node.tag.getStart(sourceFile),
          end: node.template.getStart(sourceFile),
          replacement: `${node.tag.getText()}<${typeReference}>`,
        })
      }

      ts.forEachChild(node, visitRecursive)
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
