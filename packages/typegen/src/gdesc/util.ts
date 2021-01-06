import * as glob from 'glob'
import {promisify} from 'util'
import * as lodash from 'lodash'
import * as path from 'path'
import * as assert from 'assert'

export const globAsync = promisify(glob)

/** Trim and compact whitespace. Don't use on content where whitespace matters! */
export const simplifyWhitespace = (whitespaceInsensitiveString: string, newlineReplacement = ' ') => {
  return whitespaceInsensitiveString
    .replace(/\r?\n/g, newlineReplacement)
    .replace(/[\t ]+/g, ' ')
    .trim()
}

export const pascalCase = lodash.flow(lodash.camelCase, lodash.upperFirst)

export const typeName = lodash.flow(pascalCase, s => (s.match(/^[A-Z]/) ? s : `_${s}`))

export const relativeUnixPath = (filepath: string, relativeFrom: string) => {
  return path.relative(relativeFrom, filepath).replace(/\\/g, '/')
}

export const truncate = (str: string, maxLength = 100, truncatedMessage = '... [truncated] ...') => {
  if (str.length < 120) {
    return str
  }
  const halfLength = Math.floor((maxLength - truncatedMessage.length) / 2)
  return str.slice(0, halfLength) + truncatedMessage + str.slice(-halfLength)
}

export const dedent = (str: string) => {
  const lines = str.split('\n').slice(1)
  const margin = lines[0].match(/^\s+/)![0]
  return lines.map(line => line.replace(margin, '')).join('\n')
}

export const tryOr = <A extends unknown[], T>(fn: (...args: A) => T, onErr: (...args: [...A, unknown]) => T) => (
  ...args: A
) => {
  try {
    return fn(...args)
  } catch (e: unknown) {
    return onErr(...args, e)
  }
}

export const tryOrNull = <T>(fn: () => T) => {
  try {
    return fn()
  } catch {
    return null
  }
}
