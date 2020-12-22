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
    throw new Error(`Can't run psql command ${JSON.stringify(psqlCommand)}; it has quotes in it.`)
  }

  const psql = async (query: string) => {
    query = simplifyWhitespace(query)
    const command = `echo "\${SLONIK_TYPEGEN_QUERY}" | ${psqlCommand} -f -`
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
    const rows = await psql(`
      select distinct t.typname, e.enumlabel
      from pg_enum as e
      join pg_type as t
      on t.oid = e.enumtypid
    `)
    const types = rows.map(r => ({typname: r[0], enumlabel: r[1]}))
    return lodash.groupBy(types, t => t.typname)
  })

  const getRegtypeToPGType = lodash.once(async () => {
    const rows = await psql(`
      select oid, typname, oid::regtype as regtype
      from pg_type
      where typname not like '_%'
    `)

    const types = rows.map(r => ({oid: r[0], typname: r[1], regtype: r[2]}))
    return lodash.keyBy(types, t => t.regtype)
  })

  return {psql, getEnumTypes, getRegtypeToPGType}
}

/** Parse a psql output into a list of rows (string tuples) */
export const psqlRows = (output: string): string[][] => {
  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.match(/^\(\d+ rows?\)$/))

  const start = lines.findIndex(row => {
    const dividers = row.split('+')
    return dividers.length > 0 && dividers.every(d => d.match(/^-+$/))
  })

  if (start === -1) {
    throw new Error(`Unexpected psql table format:\n${output}`)
  }

  return lines.slice(start + 1).map(row => row.split('|').map(cell => cell.trim()))
}
