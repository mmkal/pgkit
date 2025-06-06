import {execa} from '@rebundled/execa'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect, test} from 'vitest'
import {nickname} from '../src/naming'

expect.addSnapshotSerializer({
  test: Boolean,
  print: val => JSON.stringify(val, null, 2),
})

test('nickname', async () => {
  expect(nickname('select id, name from usr')).toMatchInlineSnapshot(`"select-usr"`)

  expect(nickname('select id, name from "User"')).toMatchInlineSnapshot(`"select-user"`)

  expect(
    nickname('select id, name from usr join usr_info on usr.id = usr_info.usr_id where id != 1'),
  ).toMatchInlineSnapshot(`"select-usr-usr_info-join-filtered"`)

  expect(nickname(`insert into foo (id, name) values (1, 'one')`)).toMatchInlineSnapshot(`"insert-foo"`)

  expect(nickname(`update foo set a = 'b'`)).toMatchInlineSnapshot(`"update-foo-set-a"`)

  expect(nickname(`delete from foo where a = 'b'`)).toMatchInlineSnapshot(`"delete-from-filtered"`)

  expect(nickname(`alter table foo add column a int`)).toMatchInlineSnapshot(`"alter_table"`)

  expect(
    nickname(
      `
        create table test_table(id int, name text);
        create index test_table_idx on test_table(name);
      `,
    ),
  ).toMatchInlineSnapshot(`"create_table-create_index"`)

  expect(
    // make sure nickname doesn't go too long
    nickname(`
      with foobarbaz123456789 as (select 1)
      select *
      from qwertyuiop123456789
      join asdfghjkl123456789 on a = b
      join zxcvbnm123456789 on c = d
      join foobarbaz123456789 on e = f
    `),
  ).toMatchInlineSnapshot(`"with-foobarbaz123456789-select-qwertyuiop123456789"`)

  expect(
    // ridiculous names won't get a useful nickname at all, just a keyword
    nickname(
      `select * from qwertyuiopasdfghjklzxcvbnm1234567890qwertyuiopasdfghjklzxcvbnm1234567890qwertyuiopasdfghjklzxcvbnm1234567890`,
    ),
  ).toMatchInlineSnapshot(`"select"`)

  expect(
    nickname(
      `
        with one as (
            select * from foo where x = 1
        ), two as (
            select id from bar where y = 2
        ), three as (
            insert into baz (id) values (1)
            returning *
        )
        select * from one join three on one.id = three.id
      `,
    ),
  ).toMatchInlineSnapshot(`"with-one-select-foo-filtered-bar-insert-baz-returning-three"`)
})

test('scan the whole repo', async () => {
  const repoRoot = path.join(process.cwd(), '..', '..')
  const {stdout} = await execa('git', ['ls-files', '**/*.ts'], {cwd: repoRoot})
  const tsFiles = String(stdout).split('\n').filter(Boolean)
  // for (const tsFile of tsFiles) {
  //   const sql = await fs.readFile(path.join(process.cwd(), '..', '..', tsFile), 'utf-8')
  // }

  const names = tsFiles.flatMap(filepath => {
    const ts = fs.readFileSync(path.join(repoRoot, filepath), 'utf8')
    const lines = ts.split('\n')
    const queries = [] as string[]
    const currentQuery = ''
    const currentIndex = 0

    const sqlTags = Array.from(ts.matchAll(/(sql`|sql<.*?>`)/g))

    for (const sqlTag of sqlTags) {
      const start = ts.indexOf('`', sqlTag.index) + 1
      let end = start
      while (end < ts.length) {
        if (ts[end] === '`') break
        if (ts.slice(end, end + 2) === '${') {
          end = ts.indexOf('}', end) + 1 // skip the interpolation - it might contain backticks
        } else if (ts[end] === '\\') {
          end += 2
        } else {
          end++
        }
      }
      queries.push(ts.slice(start, end).trim())
    }

    return queries
      .filter(query => {
        const keywordsToInclude = new Set([
          'select',
          'insert',
          'update',
          'delete',
          'create',
          'drop',
          'alter',
          'truncate',
          'grant',
          'revoke',
          'begin',
          'commit',
          'rollback',
          'savepoint',
          'release',
          'with',
          'alter table',
          'create table',
          'add column',
        ])
        if (
          query
            .trim()
            .split(/\s+/)
            .some(word => keywordsToInclude.has(word))
        )
          return true
        return false
        if (query.includes('*/')) return false // avoid block comments
        if (/^\W/.test(query.trim())) return false // avoid queries starting with weird characters
        return true
      })
      .map(query => {
        const untemplated = query
          .split('${')
          .map((part, i) => {
            if (i === 0) return part
            let contents = ''
            let count = 1
            for (let i = 0; i < part.length; i++) {
              if (part[i] === '{') count++
              if (part[i] === '}') {
                count--
                if (count === 0) contents = part.slice(0, i)
              }
            }
            return `$` + i + part.slice(contents.length + 1)
            return contents.replaceAll(/\W/g, '_') + part.slice(contents.length + 1)
          })
          .join('')
        return {
          filepath,
          raw: query,
          untemplated,
        }
      })
      .filter(({untemplated}) => !untemplated.includes('${')) // uhh i guess the parsing wasn't perfect
      .map(q => ({...q, nickname: nickname(q.untemplated)}))
  })

  expect(names).toMatchSnapshot()

  expect(tsFiles).toMatchInlineSnapshot(`
    [
      "apps/docs/next-env.d.ts",
      "apps/docs/scripts/build.ts",
      "packages/admin/e2e/autocomplete.demo.ts",
      "packages/admin/e2e/config.ts",
      "packages/admin/e2e/helpers/index.ts",
      "packages/admin/e2e/query.test.ts",
      "packages/admin/e2e/setup.seed.ts",
      "packages/admin/playwright.config.ts",
      "packages/admin/src/client/utils/inspect.ts",
      "packages/admin/src/client/utils/zform/augment-prototype.ts",
      "packages/admin/src/client/utils/zform/augment-type.d.ts",
      "packages/admin/src/client/vite-env.d.ts",
      "packages/admin/src/lib/utils.ts",
      "packages/admin/src/packlets/autocomplete/suggest.ts",
      "packages/admin/src/packlets/autocomplete/websql-autocomplete-lib.ts",
      "packages/admin/src/server/cli.ts",
      "packages/admin/src/server/context.ts",
      "packages/admin/src/server/declarations.d.ts",
      "packages/admin/src/server/dev.ts",
      "packages/admin/src/server/index.ts",
      "packages/admin/src/server/middleware.ts",
      "packages/admin/src/server/migrations.ts",
      "packages/admin/src/server/query.ts",
      "packages/admin/src/server/router.ts",
      "packages/admin/src/server/trpc.ts",
      "packages/admin/test/autocomplete.test.ts",
      "packages/admin/test/formatter.test.ts",
      "packages/admin/test/past.test.ts",
      "packages/admin/test/seed.test.ts",
      "packages/admin/test/sql-a.test.ts",
      "packages/admin/test/suggest-helper.ts",
      "packages/admin/vite.config.ts",
      "packages/client/src/client.ts",
      "packages/client/src/errors.ts",
      "packages/client/src/index.ts",
      "packages/client/src/naming.ts",
      "packages/client/src/sql.ts",
      "packages/client/src/standard-schema/contract.ts",
      "packages/client/src/standard-schema/errors.ts",
      "packages/client/src/standard-schema/utils.ts",
      "packages/client/src/storage.ts",
      "packages/client/src/type-parsers.ts",
      "packages/client/src/types.ts",
      "packages/client/test/__snapshots__/migra-types.ts",
      "packages/client/test/api-usage.test.ts",
      "packages/client/test/bugs.test.ts",
      "packages/client/test/client.test.ts",
      "packages/client/test/errors.test.ts",
      "packages/client/test/naming.test.ts",
      "packages/client/test/pg-promise-usage.test.ts",
      "packages/client/test/pgp.test.ts",
      "packages/client/test/recipes.test.ts",
      "packages/client/test/slonik23.test.ts",
      "packages/client/test/slonik37.test.ts",
      "packages/client/test/snapshots.ts",
      "packages/client/test/type-parsers.test.ts",
      "packages/client/test/types.test.ts",
      "packages/client/test/zod.test.ts",
      "packages/formatter/src/index.ts",
      "packages/formatter/test/index.test.ts",
      "packages/migra/scripts/generate-commands.ts",
      "packages/migra/src/changes.ts",
      "packages/migra/src/command.ts",
      "packages/migra/src/index.ts",
      "packages/migra/src/migra.ts",
      "packages/migra/src/statements.ts",
      "packages/migra/src/util.ts",
      "packages/migra/test/fixtures.ts",
      "packages/migra/test/limitations.test.ts",
      "packages/migra/test/python-parity.test.ts",
      "packages/migra/test/setup.ts",
      "packages/migrator/scripts/codegen.ts",
      "packages/migrator/src/bin.ts",
      "packages/migrator/src/cli.ts",
      "packages/migrator/src/index.ts",
      "packages/migrator/src/migrator.ts",
      "packages/migrator/src/router.ts",
      "packages/migrator/src/templates.ts",
      "packages/migrator/src/types.ts",
      "packages/migrator/test/basic.test.ts",
      "packages/migrator/test/create.test.ts",
      "packages/migrator/test/definitions.test.ts",
      "packages/migrator/test/diff.test.ts",
      "packages/migrator/test/errors.test.ts",
      "packages/migrator/test/generated/run/migrations/04.four.ts",
      "packages/migrator/test/locking.test.ts",
      "packages/migrator/test/migrator.ts",
      "packages/migrator/test/pool-helper.ts",
      "packages/migrator/test/pretty-logger.test.ts",
      "packages/migrator/test/repair.test.ts",
      "packages/migrator/test/require.main.ts",
      "packages/migrator/test/script-migrations.test.ts",
      "packages/migrator/test/transaction.test.ts",
      "packages/migrator/test/util.test.ts",
      "packages/pgkit/src/cli.ts",
      "packages/pgkit/src/client.ts",
      "packages/pgkit/src/config.ts",
      "packages/pgkit/src/migrator.ts",
      "packages/pgkit/src/router.ts",
      "packages/pgkit/test/pkg.test.ts",
      "packages/schemainspect/scripts/generate-types.ts",
      "packages/schemainspect/src/auto-this.ts",
      "packages/schemainspect/src/command.ts",
      "packages/schemainspect/src/get.ts",
      "packages/schemainspect/src/graphlib/index.ts",
      "packages/schemainspect/src/index.ts",
      "packages/schemainspect/src/inspected.ts",
      "packages/schemainspect/src/inspector.ts",
      "packages/schemainspect/src/isa-asa.ts",
      "packages/schemainspect/src/misc.ts",
      "packages/schemainspect/src/pg/index.ts",
      "packages/schemainspect/src/pg/obj.ts",
      "packages/schemainspect/src/queries.ts",
      "packages/schemainspect/src/tableformat.ts",
      "packages/schemainspect/src/types.ts",
      "packages/schemainspect/src/util.ts",
      "packages/schemainspect/test/auto-this.test.ts",
      "packages/schemainspect/test/isa-asa.test.ts",
      "packages/schemainspect/test/json.test.ts",
      "packages/typegen/src/cli.ts",
      "packages/typegen/src/defaults.ts",
      "packages/typegen/src/extract/index.ts",
      "packages/typegen/src/extract/sql.ts",
      "packages/typegen/src/extract/typescript.ts",
      "packages/typegen/src/generate.ts",
      "packages/typegen/src/migrate/index.ts",
      "packages/typegen/src/migrate/lte0.8.0.ts",
      "packages/typegen/src/pg/index.ts",
      "packages/typegen/src/pg/mappings.ts",
      "packages/typegen/src/pg/psql.ts",
      "packages/typegen/src/query/analyze-select-statement.ts",
      "packages/typegen/src/query/column-info.ts",
      "packages/typegen/src/query/index.ts",
      "packages/typegen/src/query/parameters.ts",
      "packages/typegen/src/query/parse.ts",
      "packages/typegen/src/query/tag.ts",
      "packages/typegen/src/router.ts",
      "packages/typegen/src/type-parsers/index.ts",
      "packages/typegen/src/type-parsers/map-type-parser.ts",
      "packages/typegen/src/types.ts",
      "packages/typegen/src/util.ts",
      "packages/typegen/src/utils/errors.ts",
      "packages/typegen/src/utils/memoize.ts",
      "packages/typegen/src/write/index.ts",
      "packages/typegen/src/write/inline.ts",
      "packages/typegen/src/write/prettify.ts",
      "packages/typegen/src/write/sql.ts",
      "packages/typegen/src/write/typescript.ts",
      "packages/typegen/test/ambiguous-tables.test.ts",
      "packages/typegen/test/branding.test.ts",
      "packages/typegen/test/cte.test.ts",
      "packages/typegen/test/defaults.test.ts",
      "packages/typegen/test/deletes.test.ts",
      "packages/typegen/test/example.test.ts",
      "packages/typegen/test/function.test.ts",
      "packages/typegen/test/hand-holding.test.ts",
      "packages/typegen/test/helper.ts",
      "packages/typegen/test/ignore.test.ts",
      "packages/typegen/test/inline-tag-modification.test.ts",
      "packages/typegen/test/left-join.test.ts",
      "packages/typegen/test/limitations.test.ts",
      "packages/typegen/test/locking.test.ts",
      "packages/typegen/test/nullability.test.ts",
      "packages/typegen/test/options.test.ts",
      "packages/typegen/test/pg-enum.test.ts",
      "packages/typegen/test/pgsql-ast-parser.test.ts",
      "packages/typegen/test/primitives.test.ts",
      "packages/typegen/test/property-access-tag.test.ts",
      "packages/typegen/test/register-mock-serializer.ts",
      "packages/typegen/test/subquery.test.ts",
      "packages/typegen/test/ts-output.ts",
      "packages/typegen/test/type-mappings.test.ts",
      "packages/typegen/test/type-parsers.test.ts",
      "packages/typegen/test/types.test.ts",
      "packages/typegen/test/ugly.test.ts",
      "packages/typegen/test/util.test.ts",
      "packages/typegen/test/view.test.ts",
      "packages/typegen/test/watch.test.ts",
      "tools/npmono/src/cli.ts",
      "tools/npmono/src/publish.ts"
    ]
  `)
})
