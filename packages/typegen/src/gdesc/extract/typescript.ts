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

  visitNodeGenerics(sourceFile)

  return queries

  function visitNodeGenerics(unknownNode: ts.Node) {
    if (unknownNode.kind === ts.SyntaxKind.TaggedTemplateExpression) {
      const node = unknownNode as ts.TaggedTemplateExpression
      if (node.tag.kind === ts.SyntaxKind.Identifier) {
        const tag = node.tag as ts.Identifier
        if (tag.getText() === 'sql') {
          let template: string[] = []
          if (node.template.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
            const templateNode = node.template as ts.NoSubstitutionTemplateLiteral
            template = [templateNode.text]
          }
          if (node.template.kind === ts.SyntaxKind.TemplateExpression) {
            const templateNode = node.template as ts.TemplateExpression
            template = [
              // join with $1. May not be correct if ${sql.identifier(['blah'])} is used. \gdesc will fail in that case.
              templateNode.head.text,
              ...templateNode.templateSpans.map(s => s.literal.text),
            ]
          }

          if (template.length > 0) {
            queries.push({
              // tag: 'unknown',
              node,
              file,
              sql: template
                .map((t, i) => `$${i}${t}`)
                .join('')
                .slice(2), // slice off $0 at the start
              template,
            })
          }
        }
      }
    }
    ts.forEachChild(unknownNode, visitNodeGenerics)
  }

  function visitNodePropertyAccessThing(unknownNode: ts.Node) {
    if (unknownNode.kind === ts.SyntaxKind.TaggedTemplateExpression) {
      const node = unknownNode as ts.TaggedTemplateExpression
      if (node.tag.kind == ts.SyntaxKind.PropertyAccessExpression) {
        const tag = node.tag as ts.PropertyAccessExpression
        if (tag.expression.getText() === 'sql') {
          let template: string[] = []
          if (node.template.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
            const templateNode = node.template as ts.NoSubstitutionTemplateLiteral
            template = [templateNode.text]
          }
          if (node.template.kind === ts.SyntaxKind.TemplateExpression) {
            const templateNode = node.template as ts.TemplateExpression
            template = [
              // join with $1. May not be correct if ${sql.identifier(['blah'])} is used. \gdesc will fail in that case.
              templateNode.head.text,
              ...templateNode.templateSpans.map(s => s.literal.text),
            ]
          }

          if (template.length > 0) {
            queries.push({
              // tag: tag.name.getFullText(),
              node,
              file,
              sql: template
                .map((t, i) => `$${i}${t}`)
                .join('')
                .slice(2), // slice off $0 at the start
              template,
            })
          }
        }
      }
    }
    ts.forEachChild(unknownNode, visitNodePropertyAccessThing)
  }
}

export const extractWithTypeScript: GdescriberParams['extractQueries'] = lodash.memoize(rawExtractWithTypeScript)
