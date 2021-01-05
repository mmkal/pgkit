import {randomBytes} from 'crypto'
import {DatabasePoolType, sql} from 'slonik'
import * as assert from 'assert'
import {jsdocQuery} from '../write/typescript'

export const parameterTypesGetter = (pool: DatabasePoolType) => async (query: string): Promise<string[]> => {
  const statementName = `temp_statement_${randomBytes(16).join('')}`

  await pool.query({
    type: 'SLONIK_TOKEN_SQL',
    sql: `prepare ${statementName} as ${query}`,
    values: [],
  })

  try {
    const regtypes = await pool.oneFirst(
      sql<queries.PgPreparedStatements>`
        select parameter_types::text
        from pg_prepared_statements
        where name = ${statementName}
      `,
    )

    assert.ok(regtypes, `No parameters received from: prepare ${statementName} as ${jsdocQuery(query)}`)
    assert.ok(regtypes.startsWith('{') && regtypes.endsWith('}'), `Unexpected parameter types format: ${regtypes}`)

    if (regtypes === '{}') return []

    return regtypes.slice(1, -1).split(',')
  } finally {
    await pool.query(sql`deallocate ${sql.identifier([statementName])}`)
  }
}

if (require.main === module) {
  console.log = (...args: any[]) => console.dir(args.length === 1 ? args[0] : args, {depth: null})
  parameterTypesGetter(require('slonik').createPool('postgresql://postgres:postgres@localhost:5433/postgres'))(
    `select * from gdesc_test.test_table`,
  ).then(console.log, console.error)
}

module queries {
  /** - query: `select parameter_types::text from pg_prepared_statements where name = $1` */
  export interface PgPreparedStatements {
    /** postgres type: `text` */
    parameter_types: string | null
  }
}
