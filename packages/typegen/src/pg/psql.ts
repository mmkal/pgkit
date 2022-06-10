import * as execa from 'execa'
import {simplifyWhitespace} from '../util'
import * as assert from 'assert'
import {DatabasePool} from 'slonik'
import {enumTypesGetter, regTypeToPGTypeGetter} from './mappings'

export type PSQLClient = ReturnType<typeof psqlClient>

/**
 * Get a basic postgres client. which can execute simple queries and return row results.
 * This parses `psql` output and no type parsing is done. Everything is a string.
 */
export const psqlClient = (psqlCommand: string, pool: DatabasePool) => {
  assert.ok(
    !psqlCommand.includes(`'`),
    `Can't run psql command "${psqlCommand}"; with single quotes in it. Try using double quotes or a bash alias.`,
  )

  const psql = async (query: string) => {
    query = simplifyWhitespace(query)
    const echoQuery = 'echo "${SLONIK_TYPEGEN_QUERY}"'
    const command = `${echoQuery} | ${psqlCommand} -f -`
    const result = await execa('sh', ['-c', command], {env: {SLONIK_TYPEGEN_QUERY: query}})
    try {
      return psqlRows(result.stdout)
    } catch (e: any) {
      const stdout = result.stdout || result.stderr
      e.message =
        `Error running psql query.\n` +
        `Query: ${JSON.stringify(query)}\n` +
        `Result: ${JSON.stringify(stdout)}\n` +
        `Error: ${e.message}`
      throw e
    }
  }

  const getEnumTypes = enumTypesGetter(pool)

  const getRegtypeToPGType = regTypeToPGTypeGetter(pool)

  return {psql, getEnumTypes, getRegtypeToPGType}
}

/** Parse a psql output into a list of rows (string tuples) */
export const psqlRows = (output: string): Record<string, string>[] => {
  if (output === 'The command has no result, or the result has no columns.') {
    return []
  }

  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.match(/^\(\d+ rows?\)$/))

  const dividerLines = lines
    .map((row, index) => ({row, index}))
    .filter(({row}) => {
      const dividers = row.split('+')
      return dividers.length > 0 && dividers.every(d => d.match(/^-+$/))
    })

  assert.ok(dividerLines.length <= 1, `multi statements not handled yet`)

  const start = dividerLines[0]?.index

  assert.ok(output, `Empty output received`)
  assert.ok(typeof start === 'number', `Unexpected psql table format:\n${output}`)

  const headers = parseRow(lines[start - 1])

  assert.ok(headers.length === new Set(headers).size, `Headers must not contain duplicates! ${headers}`)

  const headerMap = Object.fromEntries(headers.map((h, i) => [i, h]))

  return lines
    .slice(start + 1)
    .map(parseRow)
    .map(row => Object.fromEntries(row.map((val, i) => [headerMap[i], val])))
}

const parseRow = (r: string) => r.split('|').map(cell => cell.trim())
