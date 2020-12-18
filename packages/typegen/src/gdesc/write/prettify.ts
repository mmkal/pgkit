import * as lodash from 'lodash'

export function prettify(allFiles: Record<string, any>) {
  try {
    const prettier: typeof import('prettier') = require('prettier')
    const prettify = (val: any, filepath: string): typeof val =>
      typeof val === 'string' ? prettier.format(val, {filepath}) : lodash.mapValues(val, prettify)
    allFiles = prettify(allFiles, '.')
  } catch (e) {
    const help =
      e?.code === 'MODULE_NOT_FOUND' ? `Install prettier to fix this. ${e.message}` : `Error below:\n${e.message}`
    console.warn(`prettier failed to run; Your output will be very ugly! ${help}`)
  }
  return allFiles
}
