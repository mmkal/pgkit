import {ExtractedQuery, Options} from '../types'
import * as lodash from 'lodash'
import * as fs from 'fs'
import type * as ts from 'typescript'
import * as assert from 'assert'

const rawExtractWithTypeScript: Options['extractQueries'] = file => {
  const ts: typeof import('typescript') = require('typescript')
  const source = fs.readFileSync(file).toString()
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2015, /*setParentNodes */ true)

  // adapted from https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#traversing-the-ast-with-a-little-linter
  const queries: ExtractedQuery[] = []

  visitNodeGenerics(sourceFile)

  return queries

  function visitNodeGenerics(node: ts.Node) {
    if (ts.isTaggedTemplateExpression(node)) {
      if (ts.isIdentifier(node.tag)) {
        if (node.tag.getText() === 'sql') {
          let template: string[] = []
          if (ts.isNoSubstitutionTemplateLiteral(node.template)) {
            template = [node.template.text]
          }
          if (ts.isTemplateExpression(node.template)) {
            template = [node.template.head.text, ...node.template.templateSpans.map(s => s.literal.text)]
          }

          assert.ok(template.length > 0, `Couldn't get template for node at ${node.pos}`)

          queries.push({
            text: node.getFullText(),
            source,
            file,
            sql: template
              // join with $1. May not be correct if ${sql.identifier(['blah'])} is used. \gdesc will fail in that case.
              .map((t, i) => `$${i}${t}`)
              .join('')
              .slice(2), // slice off $0 at the start
            template,
          })
        }
      }
    }
    ts.forEachChild(node, visitNodeGenerics)
  }
}

export const extractWithTypeScript: Options['extractQueries'] = lodash.memoize(rawExtractWithTypeScript)
