import * as glob from 'glob'
import {promisify} from 'util'
import * as lodash from 'lodash'
import * as path from 'path'
import * as child_process from 'child_process'

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

export const truncateQuery = lodash.flow(simplifyWhitespace, truncate)

export const dedent = (str: string) => {
  const lines = str.split('\n').slice(1)
  const margin = lines[0].match(/^\s+/)![0]
  return lines.map(line => line.replace(margin, '')).join('\n')
}

export const attempt = <T>(context: string, action: () => T): T => {
  try {
    return action()
  } catch (e) {
    e.message = `Failure: ${context}: ${e}`
    throw e
  }
}

export const maybeDo = <T>(shouldDo: boolean, action: () => T) => {
  if (shouldDo) {
    return action()
  }
  return null
}

export const tryOrDefault = <T>(fn: () => T, defaultValue: T) => {
  try {
    return fn()
  } catch {
    return defaultValue
  }
}

/** Makes sure there are no git changes before performing destructive actions. */
export const checkClean = () =>
  attempt('git status should be clean - stage or commit your changes before re-running.', () =>
    child_process.execSync(`git diff --exit-code`),
  )

export const changedFiles = (params: {since: string; cwd: string}) =>
  child_process
    .execSync(`git diff --relative --name-only ${params.since}`, {cwd: params.cwd})
    .toString()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

export const globList = (list: string[]) => (list.length === 1 ? list[0] : `{${list.join(',')}}`)
