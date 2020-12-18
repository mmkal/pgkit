import {ExtractedQuery, GdescriberParams} from '../types'
import * as lodash from 'lodash'
import * as fs from 'fs'
import type * as ts from 'typescript'

const rawExtractWithTypeScript: GdescriberParams['extractQueries'] = file => {
  const ts: typeof import('typescript') = require('typescript')
  const sourceFile = ts.createSourceFile(
    file,
    fs.readFileSync(file).toString(),
    ts.ScriptTarget.ES2015,
    /*setParentNodes */ true,
  )

  // adapted from https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#traversing-the-ast-with-a-little-linter
  const queries: ExtractedQuery[] = []

  visitNode(sourceFile)

  return queries

  function visitNode(unknownNode: ts.Node) {
    if (unknownNode.kind === ts.SyntaxKind.TaggedTemplateExpression) {
      const node = unknownNode as ts.TaggedTemplateExpression
      if (node.tag.kind == ts.SyntaxKind.PropertyAccessExpression) {
        const tag = node.tag as ts.PropertyAccessExpression
        if (tag.expression.getText() === 'sql') {
          let sql: string = ''
          if (node.template.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
            const template = node.template as ts.NoSubstitutionTemplateLiteral
            sql = template.text
          }
          if (node.template.kind === ts.SyntaxKind.TemplateExpression) {
            const template = node.template as ts.TemplateExpression
            sql = [
              // join with $1. May not be correct if ${sql.identifier(['blah'])} is used. \gdesc will fail in that case.
              template.head.text,
              ...template.templateSpans.map(s => s.literal.text),
            ].join('$1')
          }

          if (sql) {
            queries.push({
              tag: tag.name.getFullText(),
              file,
              sql,
            })
          }
        }
      }
    }
    ts.forEachChild(unknownNode, visitNode)
  }
}

export const extractWithTypeScript: GdescriberParams['extractQueries'] = lodash.memoize(rawExtractWithTypeScript)
