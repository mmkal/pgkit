import * as fsSyncer from 'fs-syncer'
import * as typegen from '../src'
import {getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  jest.resetAllMocks()

  await helper.pool.query(helper.sql`
    create table test_table(
      id int primary key,
      n int
    );
  `)
})

test(`multi statements don't get types`, async () => {
  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`
          insert into test_table(id, n) values (1, 2);
          insert into test_table(id, n) values (3, 4);
        \`
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(logger.error).not.toHaveBeenCalled()

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default sql\`
        insert into test_table(id, n) values (1, 2);
        insert into test_table(id, n) values (3, 4);
      \`
      "
  `)
})

test('variable table name', async () => {
  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        const tableName = 'test_table'

        export default sql\`select * from ${'${sql.identifier([tableName])}'}\`
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(logger.error).not.toHaveBeenCalled()
  expect(logger.debug).toHaveBeenCalledWith(
    expect.stringMatching(/Query `select \* from \$1` in file .*index.ts is not typeable/),
  )

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      const tableName = 'test_table'
      
      export default sql\`select * from \${sql.identifier([tableName])}\`
      "
  `)
})

test('duplicate columns', async () => {
  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`select 1 as a, 'two' as a\`
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default sql<queries.A_a>\`select 1 as a, 'two' as a\`
      
      export declare namespace queries {
        /** - query: \`select 1 as a, 'two' as a\` */
        export interface A_a {
          /**
           * Warning: 2 columns detected for field a!
           *
           * regtype: \`integer\`
           *
           * regtype: \`text\`
           */
          a: (number | null) | (string | null)
        }
      }
      "
  `)
})

test('void queries', async () => {
  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default [
          sql\`update test_table set n = 0\`,
          sql\`insert into test_table values (0, 0)\`,
          sql\`create table x (y int)\`,
        ]
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default [
        sql<queries._void>\`update test_table set n = 0\`,
        sql<queries._void>\`insert into test_table values (0, 0)\`,
        sql<queries._void>\`create table x (y int)\`,
      ]
      
      export declare namespace queries {
        /**
         * queries:
         * - \`update test_table set n = 0\`
         * - \`insert into test_table values (0, 0)\`
         * - \`create table x (y int)\`
         */
        export type _void = void
      }
      "
  `)
})
