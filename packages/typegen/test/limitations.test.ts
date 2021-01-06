import * as fsSyncer from 'fs-syncer'
import * as gdesc from '../src/gdesc'
import {getHelper} from './helper'

export const {gdescParams, logger, poolHelper: helper} = getHelper({__filename})

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
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      export default sql\`
        insert into test_table(id, n) values (1, 2);
        insert into test_table(id, n) values (3, 4);
      \`
    `,
  })

  syncer.sync()

  await gdesc.gdescriber(gdescParams(syncer.baseDir))

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

test(`multi statements don't get types`, async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      export default sql\`
        insert into test_table(id, n) values (1, 2);
        insert into test_table(id, n) values (3, 4);
      \`
    `,
  })

  syncer.sync()

  await gdesc.gdescriber(gdescParams(syncer.baseDir))

  expect(logger.error).not.toHaveBeenCalled()
  expect(logger.debug).toHaveBeenCalledWith(
    expect.stringMatching(
      /Query `insert into test_table\(id, n\) values \(1, 2\); insert into test_table\(id, n\) values \(3, 4\);` in file .*index.ts is not typeable/,
    ),
  )

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
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      const tableName = 'test_table'

      export default sql\`select * from ${'${sql.identifier([tableName])}'}\`
    `,
  })

  syncer.sync()

  await gdesc.gdescriber(gdescParams(syncer.baseDir))

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
