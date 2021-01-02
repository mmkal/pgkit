import * as execa from 'execa'
import * as lodash from 'lodash'
import {simplifyWhitespace} from '../util'

export type PSQLClient = ReturnType<typeof psqlClient>

/**
 * Get a basic postgres client. which can execute simple queries and return row results.
 * This parses `psql` output and no type parsing is done. Everything is a string.
 */
export const psqlClient = (psqlCommand: string) => {
  if (psqlCommand.includes(`'`)) {
    throw new Error(`Can't run psql command ${JSON.stringify(psqlCommand)}; it has quotes in it. Try using an alias.`)
  }

  const psql = async (query: string) => {
    query = simplifyWhitespace(query)
    const echoQuery = 'echo "${SLONIK_TYPEGEN_QUERY}"'
    const command = `${echoQuery} | ${psqlCommand} -f -`
    const result = await execa('sh', ['-c', command], {env: {SLONIK_TYPEGEN_QUERY: query}})
    try {
      return psqlRows(result.stdout)
    } catch (e) {
      const stdout = result.stdout || result.stderr
      e.message =
        `Error running psql query.\n` +
        `Query: ${JSON.stringify(query)}\n` +
        `Result: ${JSON.stringify(stdout)}\n` +
        `Error: ${e.message}`
      throw e
    }
  }

  const getEnumTypes = lodash.once(async () => {
    const types = await psql(`
      select distinct t.typname, e.enumlabel
      from pg_enum as e
      join pg_type as t
      on t.oid = e.enumtypid
    `)
    return lodash.groupBy(types, t => t.typname)
  })

  const getRegtypeToPGType = lodash.once(async () => {
    const types = await psql(`
      select oid, typname, oid::regtype as regtype
      from pg_type
      where typname not like '_%'
    `)

    return lodash.keyBy(types, t => t.regtype)
  })

  return {psql, getEnumTypes, getRegtypeToPGType}
}

/** Parse a psql output into a list of rows (string tuples) */
export const psqlRows = (output: string): Record<string, string>[] => {
  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.match(/^\(\d+ rows?\)$/))

  const dividerLines = lines
    .map((row, index) => ({row, index}))
    .filter(({row, index}) => {
      const dividers = row.split('+')
      return dividers.length > 0 && dividers.every(d => d.match(/^-+$/))
    })

  if (dividerLines.length > 1) {
    // multi-statement
    throw new Error(`multi statements not handled yet`)
    // return {}
  }

  const start = dividerLines[0]?.index

  if (typeof start !== 'number') {
    console.error('cannotfindstart', {output, lines})
    return []
    throw new Error(`Unexpected psql table format:\n${output}`)
  }

  const headers = parseRow(lines[start - 1])
  if (new Set(headers).size !== headers.length) {
    throw new Error(`Headers contain duplicates! ${headers}`)
  }
  const headerMap = Object.fromEntries(headers.map((h, i) => [i, h]))

  return lines
    .slice(start + 1)
    .map(parseRow)
    .map(row => Object.fromEntries(row.map((val, i) => [headerMap[i], val])))
}

const parseRow = (r: string) => r.split('|').map(cell => cell.trim())

if (require.main === module) {
  const client = psqlClient('docker-compose exec -T postgres psql -h localhost -U postgres postgres')
  client
    .psql(
      `
        select column_name, underlying_table_name, is_underlying_nullable
        from gettypes('select t as id from nn where id is not null')
      `,
    )
    .then(console.log)
}
