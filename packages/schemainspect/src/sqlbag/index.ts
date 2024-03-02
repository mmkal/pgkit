import {createClient, sql, nameQuery} from '@pgkit/client'
import {execSync} from 'child_process'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs'
import * as path from 'path'

const memoize = <T>(fn: (input: string) => Promise<T>) => {
  const cache = new Map<string, T | Promise<T>>()
  const wrapper = async (input: string) => {
    if (cache.has(input)) {
      return cache.get(input)
    }

    const result = fn(input)
    void result.then(r => cache.set(input, r))
    cache.set(input, result)
    return result
  }

  return Object.assign(wrapper, {cache})
}

const getOrCreateClient = memoize(async (connection: string) => createClient(connection))

const executeAsync = async <T>(connection: string, stmt: string, {end = false} = {}) => {
  const client = await getOrCreateClient(connection)
  const result = await client.any(sql.raw<T>(stmt))
  if (end) await client.pgp.$pool.end()
  return result
}

// todo: remove - it's a useless wrapper around @pgkit/client - just here for migration from python
export class SqlbagS {
  constructor(public connectionString: string) {}
  execute(stmt: string) {
    return execute(this.connectionString, stmt)
  }

  async getClient() {
    return getOrCreateClient(this.connectionString)
  }

  async executeAsync<T = unknown>(stmt: string) {
    return executeAsync<T>(this.connectionString, stmt)
  }

  get dialect() {
    return {server_version_info: [12]}
  }

  get connection() {
    return {server_version: '12'}
  }
}

export const raw_execute = async (bag: SqlbagS, stmt: string) => {
  return bag.execute(stmt)
}

export class S extends SqlbagS {}

const execute = (connection: string, stmt = '') => {
  if (!stmt) {
    throw new Error(`No statement provided`)
  }

  const name = nameQuery([stmt])
  const dir = path.resolve(__dirname, `./tmp/queries/${nameQuery([connection], 'cx')}/${name}`)
  const input = path.join(dir, 'input.sql')
  const output = path.join(dir, 'output.json')
  const tsnode = path.resolve(__dirname, '../../../node_modules/.bin/ts-node')

  // process.stdout.write('executing query ' + path.relative(process.cwd(), input))
  if (process.env.MIGRA_CACHE && existsSync(output)) {
    // console.log(' ...using cached result')
    return JSON.parse(readFileSync(output).toString())
  }

  mkdirSync(dir, {recursive: true})
  writeFileSync(input, stmt)
  try {
    execSync(`${tsnode} ${__filename}`, {
      stdio: 'pipe',
      env: {
        ...process.env,
        CONNECTION: connection,
        INPUT_SQL: input,
        OUTPUT_FILE: output,
      },
    })

    const json = readFileSync(output).toString()
    // console.log(' ...done')

    return JSON.parse(json)
  } catch (e) {
    throw new Error(`SQL query failed: ${input} - ${e}`, {cause: e})
  }
}

const cli = async () => {
  const connection = process.env.CONNECTION
  const stmt = readFileSync(process.env.INPUT_SQL).toString()
  const res = await executeAsync(connection, stmt, {end: true}).catch(e => {
    throw new Error(`SQL query failed: ${process.env.INPUT_SQL} - ${e}`, {cause: e})
  })
  writeFileSync(process.env.OUTPUT_FILE, JSON.stringify(res, null, 2))
}

if (require.main === module) {
  void cli()
}
