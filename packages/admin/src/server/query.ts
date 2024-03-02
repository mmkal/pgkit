import {Client, Queryable, createClient, nameQuery, sql} from '@pgkit/client'
import * as parser from 'pgsql-ast-parser'

const clients = {} as Record<string, Client>
export const runQuery = async (query: string, connectionString: string) => {
  clients[connectionString] ||= createClient(connectionString)
  const client = clients[connectionString]

  if (query.startsWith('--no-parse\n')) {
    return [await runOneQuery(query, client)]
  }

  let parsed: parser.Statement[]
  try {
    parsed = parser.parse(query, {locationTracking: true})
  } catch (err) {
    makeJsonable(err)
    err.message = [
      err.message,
      '',
      `If you think the query is actually valid, it's possible the parsing library has a bug.`,
      `Try adding --no-parse at the top of your query to disable statement-level query parsing and send it to the DB anyway.`,
    ].join('\n')
    return [{query: nameQuery([query]), original: query, error: err, result: null}]
  }

  const results = [] as QueryResult[]
  await client
    .transaction(async tx => {
      for (const stmt of parsed) {
        const statementSql = stmt._location
          ? query.slice(stmt._location.start, stmt._location.end + 1)
          : parser.toSql.statement(stmt)
        const result = await runOneQuery(statementSql, tx)
        results.push(result)

        if (result.error) {
          const position = (result.error as any).cause?.error?.position
          if (position && stmt._location) {
            result.position = stmt._location.start + Number(position)
          }

          throw result.error
        }
      }
    })
    .catch((e: unknown) => {
      const error = new Error(`Transaction rolled back`, {cause: e})
      makeJsonable(error)
      results.push({query: nameQuery([query]), original: query, error, result: null})
    })

  return results
}

export type QueryResult =
  | {
      query: string
      original: string
      error: null
      result: Array<Record<string, unknown>>
    }
  | {
      query: string
      original: string
      error: Error
      position?: number
      result: null
    }

export const runOneQuery = async (query: string, client: Queryable): Promise<QueryResult> => {
  const name = nameQuery([query])
  try {
    const result = await client.any<Record<string, unknown>>(sql.raw(query))
    return {query: name, original: query, error: null, result}
  } catch (err: unknown) {
    makeJsonable(err)
    return {query: name, original: query, error: err, result: null}
  }
}

const makeJsonable: (e: unknown) => asserts e is Error = e => {
  const err = e as Error
  Object.assign(err, {
    toJSON: () => ({message: err.message?.includes('\n') ? err.message.split('\n') : err.message, ...(e as {})}),
  })
}
