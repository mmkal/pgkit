#! /usr/bin/env node

import {Queryable, createClient} from '@pgkit/client'
import {PostgreSQL} from '@pgkit/schemainspect'
import {initTRPC} from '@trpc/server'
import {readFile} from 'fs/promises'
import {createCli, TrpcCliMeta} from 'trpc-cli'
import {z} from 'zod'
import {Migration} from './migra'

// deviation: always return a PostgreSQL instance, and make `Migration.create` only accept PostgreSQL instances
const argContext = async (connInfo: Queryable | string): Promise<PostgreSQL | Queryable> => {
  if (typeof connInfo !== 'string') {
    return connInfo
  }

  if (connInfo === 'EMPTY') {
    return PostgreSQL.empty()
  }

  if (connInfo.startsWith('file://')) {
    const url = new URL(connInfo)
    if (url.hostname) throw new Error(`Not implemented: can only read files from localhost (got ${url.hostname})`)
    const content = await readFile(url.pathname, 'utf8')
    return PostgreSQL.fromJSON(JSON.parse(content))
  }

  if (/^https?:\/\//.test(connInfo)) {
    const response = await fetch(connInfo)
    return PostgreSQL.fromJSON(await response.json())
  }

  return createClient(connInfo)
}

export const run = async (dburlFrom: Queryable | string, dburlTarget: Queryable | string, args: MigraOptions = {}) => {
  // const {schema} = args
  // const {excludeSchema} = args
  // const out: typeof process.stdout = args.out || process.stdout
  // const err: typeof process.stderr = args.err || process.stderr

  const migrationOptions = {
    schema: args.schema,
    exclude_schemas: args.excludeSchema,
    ignore_extension_versions: args.ignoreExtensionVersions,
  }

  const ac0 = await argContext(dburlFrom)
  const ac1 = await argContext(dburlTarget)
  const m = await Migration.create(ac0, ac1, migrationOptions)

  if (args.unsafe) {
    m.set_safety(false)
  }

  if (args.createExtensionsOnly) {
    m.add_extension_changes({drops: false})
  } else {
    m.add_all_changes(args.withPrivileges)
  }

  return m

  // console.log('m.statements', m.statements, {sql: m.sql})

  // try {
  //   if (m.statements) {
  //     if (args.forceUtf8) {
  //       throw new Error(`don't use forceUtf8: out.write(m.sql.encode('utf8'))`)
  //     } else {
  //       out.write(m.sql)
  //     }
  //   }
  // } catch (e) {
  //   if (e instanceof UnsafeMigrationException) {
  //     // eslint-disable-next-line mmkal/unicorn/prefer-type-error
  //     throw new Error(`-- ERROR: destructive statements generated. Use the --unsafe flag to suppress this error.`)
  //     // err.write('-- ERROR: destructive statements generated. Use the --unsafe flag to suppress this error.')
  //     // return 3
  //   }

  //   throw e
  // }

  // console.log('m.statements', m.statements)

  // if (!m.statements) {
  //   throw new Error(`statements shouldn't be null`, {cause: 2})
  //   // return 0
  // }

  // if (m.statements.length === 0) {
  //   throw new Error(`No statements`)
  // }

  // console.log(m.statements)
  // throw new Error(`No statements generated`, {cause: 2})
  // return 2
}

const t = initTRPC.meta<TrpcCliMeta>().create()
export const MigraOptions = z.object({
  unsafe: z.boolean().default(false).describe('Prevent migra from erroring upon generation of drop statements.'),
  schema: z.string().optional().describe('Restrict output to statements for a particular schema'),
  excludeSchema: z
    .string()
    .array()
    .optional()
    .describe('Restrict output to statements for all schemas except the specified schema'),
  createExtensionsOnly: z
    .boolean()
    .default(false)
    .describe('Only output "create extension..." statements, nothing else.'),
  ignoreExtensionVersions: z.boolean().default(false).describe('Ignore the versions when comparing extensions.'),
  withPrivileges: z
    .boolean()
    .default(false)
    .describe('Also output privilege differences (ie. grant/revoke statements)'),
  forceUtf8: z.boolean().default(false).describe('Force UTF-8 encoding for output'),
})
export type MigraOptions = z.infer<typeof MigraOptions>

// export type Flags = MigraOptions

const MigraRunInput = z.tuple([z.string().describe('dburlFrom'), z.string().describe('dburlTarget'), MigraOptions])

const router = t.router({
  run: t.procedure
    .meta({
      description: 'Diff two databases and output the statements to migrate from one to the other.',
      examples: [
        `migra 'postgresql://postgres:postgres@localhost:5432/migra_test_collations_a' 'postgresql://postgres:postgres@localhost:5432/migra_test_collations_a'`,
        `migra 'postgresql://postgres:postgres@localhost:5432/migra_test_collations_a' 'postgresql://postgres:postgres@localhost:5432/migra_test_collations_a' --unsafe`,
      ],
      default: true,
    })
    .input(MigraRunInput)
    .query(async ({input: [dburlFrom, dburlTarget, args]}) => {
      const {sql} = await run(dburlFrom, dburlTarget, args)
      return sql
    }),
})

if (require.main === module) {
  // eslint-disable-next-line unicorn/prefer-top-level-await, no-console
  const cli = createCli({router})
  void cli.run()
}
