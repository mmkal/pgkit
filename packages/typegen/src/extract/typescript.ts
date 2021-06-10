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

  visitNodeGenerics(sourceFile, [])

  return queries

  function visitNodeGenerics(node: ts.Node, context: string[]) {
    if (!ts.isTaggedTemplateExpression(node)) {
      const newContext = ts.isVariableDeclaration(node) ? [...context, node.name.getText()] : context
      ts.forEachChild(node, n => visitNodeGenerics(n, newContext))
      return
    }
    const isSqlIdentifier = (n: ts.Node) => ts.isIdentifier(n) && n.getText() === 'sql'
    const sqlPropertyAccessor = ts.isPropertyAccessExpression(node.tag) && isSqlIdentifier(node.tag.name)
    if (isSqlIdentifier(node.tag) || sqlPropertyAccessor) {
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
        context,
        line: node.getSourceFile().getLineAndCharacterOfPosition(node.pos).line + 1,
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

export const extractWithTypeScript: Options['extractQueries'] = lodash.memoize(rawExtractWithTypeScript)
