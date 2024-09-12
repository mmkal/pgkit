import * as assert from 'assert'
import * as fs from 'fs'

import type * as ts from 'typescript'

import {ExtractedQuery, Options} from '../types'
import {isReturningQuery, tsCustom} from '../util'

const rawExtractWithTypeScript: Options['extractQueries'] = file => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ts = require('typescript') as typeof import('typescript')
  let source: string
  try {
    source = fs.readFileSync(file).toString()
  } catch (e) {
    throw new Error(`Couldn't read file ${file}`, {cause: e})
  }
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2015, /* setParentNodes */ true)

  // adapted from https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#traversing-the-ast-with-a-little-linter
  const queries: ExtractedQuery[] = []

  visitNodeGenericsRecursive(sourceFile, [])

  return queries

  function visitNodeGenericsRecursive(node: ts.Node, context: string[]) {
    if (!ts.isTaggedTemplateExpression(node)) {
      const newContext =
        (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node) || ts.isFunctionDeclaration(node)) && node.name
          ? [...context, node.name.getText()]
          : context
      ts.forEachChild(node, n => visitNodeGenericsRecursive(n, newContext))
      return
    }

    if (tsCustom.isSqlLiteral(node)) {
      let template: string[] = []
      if (ts.isNoSubstitutionTemplateLiteral(node.template)) {
        template = [node.template.text]
      }

      if (ts.isTemplateExpression(node.template)) {
        template = [node.template.head.text, ...node.template.templateSpans.map(s => s.literal.text)]
      }

      assert.ok(template.length > 0, `Couldn't get template for node at ${node.pos}`)

      const sql = template
        // join with $1. May not be correct if ${sql.identifier(['blah'])} is used. \gdesc will fail in that case.
        .map((t, i) => `$${i}${t}`)
        .join('')
        .slice(2) // slice off $0 at the start

      if (!isReturningQuery(sql)) {
        // this is likely a fragment. let's skip it.
        return
      }

      queries.push({
        type: 'extracted',
        text: node.getFullText(),
        source,
        file,
        context,
        line: node.getSourceFile().getLineAndCharacterOfPosition(node.pos).line + 1,
        sql,
        template,
      })
    }
  }
}

export const extractWithTypeScript: Options['extractQueries'] = rawExtractWithTypeScript
