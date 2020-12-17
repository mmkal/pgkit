import * as execa from 'execa'
import {simplifyWhitespace} from '../util'

export const psqlClient = (psqlCommand: string) => (query: string) => {
  query = simplifyWhitespace(query)
  const command = `echo '${query.replace(/'/g, `'"'"'`)}' | ${psqlCommand} -f -`
  const result = await execa('sh', ['-c', command])
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

export const psqlRows = (output: string) => {
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
