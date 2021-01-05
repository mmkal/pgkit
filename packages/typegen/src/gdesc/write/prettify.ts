import * as findUp from 'find-up'

export function prettifyOne({filepath, content}: {filepath: string; content: string}) {
  try {
    const prettier: typeof import('prettier') = require('prettier')
    const rcFile = findUp.sync('.prettierrc.js')
    const rc = rcFile && require(rcFile)
    return prettier.format(content, {filepath, ...rc})
  } catch (e) {
    const help =
      e?.code === 'MODULE_NOT_FOUND' ? `Install prettier to fix this. ${e.message}` : `Error below:\n${e.message}`
    console.warn(`prettier failed to run; Your output might be ugly! ${help}`)
  }
  return content
}

export const tsPrettify = (uglyContent: string) => {
  const ts: typeof import('typescript') = require('typescript')
  const sourceFile = ts.createSourceFile(__filename, uglyContent, ts.ScriptTarget.ES2015, true)
  const prettyContent = ts.createPrinter().printNode(ts.EmitHint.SourceFile, sourceFile, sourceFile)
  return prettyContent
    .replace(/\nexport /g, '\n\nexport ') // typescript printer squashes everything a bit too much
    .replace(/\n(\s*\/\*)/g, '\n\n$1')
    .replace(/(\*\/\r?\n)\r?\n/g, '$1')
    .replace(/\*\/(\r?\n)\r?\n/g, '$1') // typescript printer squashes everything a bit too much
}
