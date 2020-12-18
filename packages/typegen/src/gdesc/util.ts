import * as glob from 'glob'
import {promisify} from 'util'
import * as lodash from 'lodash'

export const globAsync = promisify(glob)

/** Trim and compact whitespace. Don't use on content where whitespace matters! */
export const simplifyWhitespace = (whitespaceInsensitiveString: string, newlineReplacement = ' ') => {
  return whitespaceInsensitiveString
    .replace(/\r?\n/g, newlineReplacement)
    .replace(/[\t ]+/g, ' ')
    .trim()
}

export const pascalCase = (str: string) => {
  const camel = lodash.camelCase(str)
  return camel.slice(0, 1).toUpperCase() + camel.slice(1)
}
