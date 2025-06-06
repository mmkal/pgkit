import {Queryable} from '@pgkit/client'
import {connection_from_s_or_c} from './misc'
import {PostgreSQL} from './pg'

// deviation: python code had a `SUPPORTED` object that was used to determine which inspector to use based on the dialect of the connection object. we only do postgresql, so no need for that
// const SUPPORTED = {postgresql: PostgreSQL}

export async function get_inspector(x: Queryable | PostgreSQL | null, schema?: string, exclude_schema?: string[]) {
  if (schema && exclude_schema) {
    throw new Error('Cannot provide both schema and exclude_schema')
  }

  if (x instanceof PostgreSQL) {
    return x
  }

  if (x === null) {
    return PostgreSQL.empty()
  }

  const c = connection_from_s_or_c(x)
  // deviating from python: we don't have a `dialect` property on the connection object, so just initialize a PostgreSQL inspector
  const inspected = await PostgreSQL.create(c)

  if (schema) {
    inspected.one_schema(schema)
  } else if (exclude_schema) {
    exclude_schema.forEach(e => inspected.exclude_schema(e))
  }

  return inspected
}
