import * as findUp from 'find-up'

export async function prettifyOne({filepath, content}: {filepath: string; content: string}) {
  try {
    // eslint-disable-next-line mmkal/import/no-extraneous-dependencies
    const prettier: typeof import('prettier') = require('prettier')
    const rcFile = findUp.sync('.prettierrc.js')
    const rc = rcFile && require(rcFile)
    return await prettier.format(content, {filepath, ...rc})
  } catch (e: any) {
    const help =
      e.code === 'MODULE_NOT_FOUND' ? `Install prettier to fix this. ${e.message}` : `Error below:\n${e.message}`
    console.warn(`prettier failed to run; Your output might be ugly! ${help}`)
  }

  return content
}

/**
 * Uses typescript to prettify some code by parsing it into an AST then re-printing it. This will look OK but probably
 * won't conform to your lint rules. It also may or may not work if there are syntax errors.
 */
export const tsPrettify = (uglyContent: string) => {
  const ts: typeof import('typescript') = require('typescript')
  const sourceFile = ts.createSourceFile('', uglyContent, ts.ScriptTarget.ES2015, true)
  const prettyContent = ts.createPrinter().printNode(ts.EmitHint.SourceFile, sourceFile, sourceFile)
  return prettyContent
    .replaceAll('\nexport ', '\n\nexport ') // typescript printer squashes everything a bit too much
    .replaceAll(/\n(\s*\/\*)/g, '\n\n$1')
    .replaceAll(/(\*\/\r?\n)\r?\n/g, '$1')
    .replaceAll(/\*\/(\r?\n)\r?\n/g, '$1') // typescript printer squashes everything a bit too much
}
