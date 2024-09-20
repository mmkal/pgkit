import * as findUp from 'find-up'

/**
 * Uses typescript to prettify some code by parsing it into an AST then re-printing it. This will look OK but probably
 * won't conform to your lint rules. It also may or may not work if there are syntax errors.
 */
export const tsPrettify = (uglyContent: string) => {
  // eslint-disable-next-line
  const ts: typeof import('typescript') = require('typescript')
  const sourceFile = ts.createSourceFile('', uglyContent, ts.ScriptTarget.ES2015, true)
  const prettyContent = ts.createPrinter().printNode(ts.EmitHint.SourceFile, sourceFile, sourceFile)
  return prettyContent
    .replaceAll('\nexport ', '\n\nexport ') // typescript printer squashes everything a bit too much
    .replaceAll(/\n(\s*\/\*)/g, '\n\n$1')
    .replaceAll(/(\*\/\r?\n)\r?\n/g, '$1')
    .replaceAll(/\*\/(\r?\n)\r?\n/g, '$1') // typescript printer squashes everything a bit too much
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
/* eslint-disable import-x/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

export async function prettifyOne({filepath, content}: {filepath: string; content: string}) {
  if (typeof content !== 'string') throw new Error('content is not a string: ' + typeof content)
  try {
    const prettier: typeof import('prettier') = require('prettier')
    const rcFile = findUp.sync('.prettierrc.js')
    const rc = rcFile && (require(rcFile) as {})
    return await prettier.format(content, {filepath, ...rc})
  } catch (e: any) {
    let message = `prettier failed to run; Your output might be ugly!`
    if (e.code === 'MODULE_NOT_FOUND') {
      message += ` Install prettier to fix this. ${e.message}`
    }
    const wrapped = new Error(message, {cause: e})
    console.warn(wrapped)
  }

  return content
}
