import * as glob from 'glob'
import {promisify} from 'util'
import * as lodash from 'lodash'
import * as path from 'path'

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

export const relativeUnixPath = (filepath: string, relativeFrom = process.cwd()) => {
  return path.relative(relativeFrom, filepath).replace(/\\/g, '/')
}

export const truncate = (str: string, maxLength = 100, truncatedMessage = '... [truncated] ...') => {
  if (str.length < 120) {
    return str
  }
  const halfLength = Math.floor((maxLength - truncatedMessage.length) / 2)
  return str.slice(0, halfLength) + truncatedMessage + str.slice(-halfLength)
}
