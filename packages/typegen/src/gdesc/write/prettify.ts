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
