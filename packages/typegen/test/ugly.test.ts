import * as fsSyncer from 'fs-syncer'
import * as typegen from '../src'
import {getHelper} from './helper'

export const {gdescParams, logger, poolHelper: helper} = getHelper({__filename})

jest.mock('prettier')

const mockFormat = jest.spyOn(require('prettier'), 'format')

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table test_table(
      id int primary key,
      n int
    );
  `)
})

test('prettier is optional', async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      export default sql\`select id, n from test_table\`
    `,
  })

  syncer.sync()

  mockFormat.mockImplementationOnce(() => {
    throw Object.assign(new Error('prettier not found'), {code: 'MODULE_NOT_FOUND'})
  })
  const mockWarn = jest.spyOn(console, 'warn').mockReset()

  await typegen.generate(gdescParams(syncer.baseDir))

  expect(mockWarn).toBeCalledTimes(1)
  expect(mockWarn.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      "prettier failed to run; Your output might be ugly! Install prettier to fix this. prettier not found",
    ]
  `)

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default sql<queries.TestTable>\`select id, n from test_table\`
      
      module queries {
      
          /** - query: \`select id, n from test_table\` */
          export interface TestTable {
      
              /** column: \`ugly_test.test_table.id\`, not null: \`true\`, postgres type: \`integer\` */
              id: number;
      
              /** column: \`ugly_test.test_table.n\`, postgres type: \`integer\` */
              n: (number) | null;
          }
      }
      "
  `)
})

test('prettier can fail', async () => {
  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      export default sql\`select id, n from test_table\`
    `,
  })

  syncer.sync()

  mockFormat.mockImplementationOnce(() => {
    throw new Error('Syntax error on line 1234')
  })
  const mockWarn = jest.spyOn(console, 'warn').mockReset()

  await typegen.generate(gdescParams(syncer.baseDir))

  expect(mockWarn).toBeCalledTimes(1)
  expect(mockWarn.mock.calls[0]).toMatchInlineSnapshot(`
    Array [
      "prettier failed to run; Your output might be ugly! Error below:
    Syntax error on line 1234",
    ]
  `)

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default sql<queries.TestTable>\`select id, n from test_table\`
      
      module queries {
      
          /** - query: \`select id, n from test_table\` */
          export interface TestTable {
      
              /** column: \`ugly_test.test_table.id\`, not null: \`true\`, postgres type: \`integer\` */
              id: number;
      
              /** column: \`ugly_test.test_table.n\`, postgres type: \`integer\` */
              n: (number) | null;
          }
      }
      "
  `)
})
