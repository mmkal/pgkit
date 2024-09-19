import * as child_process from 'child_process'
import * as lodash from 'lodash'
import * as path from 'path'

import * as ts from 'typescript'

/** Trim and compact whitespace. Don't use on content where whitespace matters! */
export const simplifyWhitespace = (whitespaceInsensitiveString: string, newlineReplacement = ' ') => {
  return whitespaceInsensitiveString
    .replaceAll(/\r?\n/g, newlineReplacement)
    .replaceAll(/[\t ]+/g, ' ')
    .trim()
}

// eslint-disable-next-line @typescript-eslint/unbound-method
export const pascalCase = lodash.flow(lodash.camelCase, lodash.upperFirst)

export const typeName = lodash.flow(pascalCase, s => (/^[A-Z]/.test(s) ? s : `_${s}`))

export const relativeUnixPath = (filepath: string, relativeFrom: string) => {
  return path.relative(relativeFrom, filepath).replaceAll('\\', '/')
}

export const truncate = (str: string, maxLength = 100, truncatedMessage = '... [truncated] ...') => {
  if (str.length <= maxLength + truncatedMessage.length) {
    return str
  }

  const halfLength = Math.floor((maxLength - truncatedMessage.length) / 2)
  return str.slice(0, halfLength) + truncatedMessage + str.slice(-halfLength)
}

export const truncateQuery = lodash.flow(simplifyWhitespace, truncate)

export const dedent = (str: string) => {
  const lines = str.split('\n').slice(1)
  const margin = /^\s+/.exec(lines[0])?.[0]
  return lines.map(line => line.replace(margin ?? '', '')).join('\n')
}

export const tryOrDefault = <T>(fn: () => T, defaultValue: T) => {
  try {
    return fn()
  } catch {
    return defaultValue
  }
}

/** Makes sure there are no git changes before performing destructive actions. */
export const checkClean = () => {
  try {
    child_process.execSync(`git diff --exit-code`)
  } catch (e) {
    throw new Error(`git status should be clean - stage or commit your changes before re-running.`, {cause: e})
  }
}

export const changedFiles = (params: {since: string; cwd: string}) =>
  child_process
    .execSync(`git diff --relative --name-only ${params.since}`, {cwd: params.cwd})
    .toString()
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

export const globList = (list: readonly string[]) => (list.length === 1 ? list[0] : `{${list.join(',')}}`)

export const tsCustom = (() => {
  const isSqlIdentifier = (node: ts.Node) => ts.isIdentifier(node) && node.getText() === 'sql'
  const isSqlPropertyAccessor = (e: ts.Expression) => ts.isPropertyAccessExpression(e) && isSqlIdentifier(e.name)
  /**
   * Checks if the supplied node is an sql template literal
   */
  const isSqlLiteral = (node: ts.Node): node is ts.TaggedTemplateExpression =>
    ts.isTaggedTemplateExpression(node) && (isSqlIdentifier(node.tag) || isSqlPropertyAccessor(node.tag))
  return {
    isSqlLiteral,
  } as const
})()

/**
 * Tests a string against a regex checking for the existence of specific keywords.
 * The rationale here is that typegen should only consider queries containing for example `SELECT`, and skip query fragments.
 */
export const isReturningQuery = (() => {
  const returningKeywords = /(^|\s|\()(select|values|returning)\s/i
  return (query: string) => returningKeywords.test(query)
})()

/**
 * Checks if a string contains a sql-comment, meant to signal typegen to ignore it.
 */
export const containsIgnoreComment = (() => {
  const ignoreKeywords = /--[^\S\n\f\r]*typegen-ignore|(\/\*\s*typegen-ignore\s*\*\/)/i
  return (query: string) => ignoreKeywords.test(query)
})()

/**
 * Like `Promise.all`, but processes items in chunks to avoid parallelism issues, or more likely to avoid me worrying about parallelism issues.
 * My worry should be resolved one way or another, but changing the default chunk size is easy vs huntin down all `Promise.all` usage.
 */
export const promiseDotAllChunked = async <T, U>(
  list: T[],
  fn: (item: T, index: number) => Promise<U>,
  {chunkSize = 1} = {},
) => {
  const results: U[] = []
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize)
    const chunkResults = await Promise.all(chunk.map((item, chunkIndex) => fn(item, i + chunkIndex)))
    results.push(...chunkResults)
  }
  return results
}

export const test = () => {
  const arr = ['a', 'b']
  return promiseDotAllChunked(arr, async item => {
    return item satisfies string
  })
}
