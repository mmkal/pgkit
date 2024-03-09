import {createClient} from '@pgkit/client'
import {PostgreSQL} from '@pgkit/schemainspect'
import {readFile} from 'fs/promises'
import {Migration} from './migra'

const argContext = async (x: string) => {
  if (x === 'EMPTY') {
    return PostgreSQL.empty()
  }

  if (x.startsWith('file://')) {
    const url = new URL(x)
    if (url.hostname) throw new Error(`Not implemented: can only read files from localhost (got ${url.hostname})`)
    const content = await readFile(url.pathname, 'utf8')
    return PostgreSQL.fromJSON(JSON.parse(content))
  }

  if (/^https?:\/\//.test(x)) {
    const response = await fetch(x)
    return PostgreSQL.fromJSON(await response.json())
  }

  return createClient(x)
}

export type Flags = Partial<CLI['flags']>

export const run = async (dburlFrom: string, dburlTarget: string, args: Flags) => {
  // const {schema} = args
  // const {excludeSchema} = args
  // const out: typeof process.stdout = args.out || process.stdout
  // const err: typeof process.stderr = args.err || process.stderr

  const migrationOptions = {
    schema: args.schema,
    exclude_schema: args.excludeSchema,
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

export const getCli = async () => {
  const {default: meow} = await import('meow')
  const cli = meow(
    `
      Usage
          $ command [input]

      Options
          --unsafe, -u  Prevent migra from erroring upon generation of drop statements.
          --schema, -s  Restrict output to statements for a particular schema
          --excludeSchema, -e  Restrict output to statements for all schemas except the specified schema
          --createExtensionsOnly, -c  Only output "create extension..." statements, nothing else.
          --ignoreExtensionVersions, -i  Ignore the versions when comparing extensions.
          --withPrivileges, -w  Also output privilege differences (ie. grant/revoke statements)
          --forceUtf8, -f  Force UTF-8 encoding for output
          --dburlFrom, -d  The database you want to migrate.
          --dburlTarget, -t  The database you want to use as the target.

      Examples
          $ command --unsafe --schema mySchema
    `,
    {
      flags: {
        unsafe: {type: 'boolean', shortFlag: 'u'},
        schema: {type: 'string', shortFlag: 's'},
        excludeSchema: {type: 'string', shortFlag: 'e'},
        createExtensionsOnly: {type: 'boolean', shortFlag: 'c'},
        ignoreExtensionVersions: {type: 'boolean', shortFlag: 'i'},
        withPrivileges: {type: 'boolean', shortFlag: 'w'},
        forceUtf8: {type: 'boolean', shortFlag: 'f'},
      },
      importMeta: {
        url: `file://${__filename}`,
        dirname: __dirname,
        filename: __filename,
        resolve: x => x,
      },
    },
  )

  return cli
}

export type CLI = Awaited<ReturnType<typeof getCli>>

export const do_command = async () => {
  const cli = await getCli()
  const [dburlFrom, dburlTarget] = cli.input
  if (!dburlFrom || !dburlTarget) {
    cli.showHelp(1)
  }

  const {sql} = await run(dburlFrom, dburlTarget, cli.flags)
  return sql
  // process.exit(status)
}

if (require.main === module) {
  // eslint-disable-next-line mmkal/unicorn/prefer-top-level-await, no-console
  void do_command().then(console.log)
}
