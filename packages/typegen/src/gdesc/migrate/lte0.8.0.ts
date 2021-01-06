import * as fs from 'fs'
import type * as ts from 'typescript'
import * as lodash from 'lodash'

interface Edit {
  start: number
  end: number
  replacement: string
}

export const migrate080 = (file: string) => {
  const ts: typeof import('typescript') = require('typescript')
  const origSource = fs.readFileSync(file).toString()
  const sourceFile = ts.createSourceFile(file, origSource, ts.ScriptTarget.ES2015, /*setParentNodes */ true)

  visitNodes(sourceFile)

  const edits: Edit[] = []

  visitNodes(sourceFile)

  const newSource = lodash
    .sortBy(edits, e => e.end)
    .reduceRight((source, edit) => source.slice(0, edit.start) + edit.replacement + source.slice(edit.end), origSource)

  fs.writeFileSync(file, newSource)

  function visitNodes(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const importSqlFromSlonik = `import { sql } from 'slonik'`
      if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause?.namedBindings)) {
        const sqlImport = node.importClause.namedBindings.elements.find(e => e.name.escapedText === 'sql')
        if (node.importClause.namedBindings.elements.length === 1 && sqlImport) {
          edits.push({
            start: node.getStart(sourceFile),
            end: node.getEnd(),
            replacement: importSqlFromSlonik,
          })
        } else if (sqlImport) {
          edits.push({
            start: sqlImport.getStart(sourceFile),
            end: sqlImport.getEnd(),
            replacement: '',
          })
          edits.push({
            start: node.getStart(sourceFile),
            end: node.getEnd(),
            replacement: `${importSqlFromSlonik}\n`,
          })
        }
      }
    }
    if (ts.isTaggedTemplateExpression(node)) {
      if (ts.isPropertyAccessExpression(node.tag)) {
        if (node.tag.expression.getText() === 'sql') {
          edits.push({
            start: node.getStart(sourceFile),
            end: node.getEnd(),
            replacement: 'sql',
          })
        }
      }
    }
    ts.forEachChild(node, visitNodes)
  }
}
