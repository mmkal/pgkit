import {FieldInfo, Queryable, nameQuery, sql} from '@pgkit/client'
import PGQueryEmscripten from 'pg-query-emscripten'
import {type ServerContext} from './context.js'

export const runQuery = async (query: string, {connection}: ServerContext): Promise<QueryResult[]> => {
  if (query.startsWith('--split-semicolons\n')) {
    const queries = query.split(/;\s*\n/)
    const results = []
    for (const q of queries) {
      results.push(await runOneQuery(q, connection))
    }
    return results
  }
  if (query.startsWith('--no-parse\n')) {
    return [await runOneQuery(query, connection)]
  }

  const results = [] as QueryResult[]

  const [parseError, nativeParsed] = await Promise.resolve()
    .then(() => new PGQueryEmscripten())
    .then(parser => [null, parser.parse(query)] as const)
    .catch((error: Error) => [error, null] as const)

  if (parseError || nativeParsed.error) {
    const error = parseError || new Error(nativeParsed.error!.message, {cause: nativeParsed.error})
    error.message = [
      error.message,
      '',
      `If you think the query is actually valid, it's possible the parsing library has a bug.`,
      `Try adding --no-parse at the top of your query to disable statement-level query parsing and send it to the DB as-is.`,
    ].join('\n')
    makeJsonable(error)
    return [
      {
        query: nameQuery([query]),
        original: query,
        error,
        result: null,
        fields: null,
        position: nativeParsed?.error?.cursorpos,
      },
    ]
  }

  const slices = nativeParsed.parse_tree.stmts.map(s => {
    // if (typeof s?.stmt_location !== 'number') return undefined

    const start = s.stmt_location ?? 0
    const length = s.stmt_len
    const end = typeof length === 'number' ? start + length : undefined

    return [start, end] as const
  })

  if (!slices.every(Array.isArray)) {
    throw new Error('Failed to parse query')
  }

  await connection.transaction(async tx => {
    for (const [start, end] of slices as [number, number][]) {
      const result = await runOneQuery(query.slice(start, end), tx)

      if (result.error) {
        // @ts-expect-error optional chain yolo
        const position: unknown = result.error?.cause?.error?.position
        if (typeof position === 'number') result.position = start + Number(position)
      }
      results.push(result)
    }
  })

  return results
}

export type QueryResult =
  | {
      query: string
      original: string
      error: null
      result: Array<Record<string, unknown>>
      fields: FieldInfo[]
    }
  | {
      query: string
      original: string
      error: Error
      position?: number
      result: null
      fields: null
    }

export const runOneQuery = async (query: string, client: Queryable): Promise<QueryResult> => {
  const name = nameQuery([query])
  try {
    const result = await client.query<Record<string, unknown>>(sql.raw(query))
    return {query: name, original: query, error: null, result: result.rows, fields: result.fields}
  } catch (err: unknown) {
    makeJsonable(err)
    return {query: name, original: query, error: err, result: null, fields: null}
  }
}

const makeJsonable: (e: unknown) => asserts e is Error = e => {
  const err = e as Error
  Object.assign(err, {
    toJSON: () => ({message: err.message?.includes('\n') ? err.message.split('\n') : err.message, ...(e as {})}),
  })
}
