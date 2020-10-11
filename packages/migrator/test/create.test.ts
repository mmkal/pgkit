import {join} from 'path'
import {range} from 'lodash'
import {createPool, sql} from 'slonik'
import {setupSlonikMigrator} from '../src'
import {fsSyncer} from 'fs-syncer'

const slonik = createPool('postgresql://postgres:postgres@localhost:5433/postgres', {idleTimeout: 1})

const millisPerDay = 1000 * 60 * 60 * 24
const fakeDates = range(0, 100).map(days => new Date(new Date('2000').getTime() + days * millisPerDay).toISOString())

const toISOSpy = jest.spyOn(Date.prototype, 'toISOString')
toISOSpy.mockImplementation(() => fakeDates[toISOSpy.mock.calls.length - 1])

describe('create', () => {
  const syncer = fsSyncer(join(__dirname, 'generated/create/migrations'), {})

  const migrator = setupSlonikMigrator({slonik, migrationsPath: syncer.baseDir})

  beforeEach(() => {
    syncer.sync()
    toISOSpy.mockClear()
  })

  afterAll(syncer.sync)

  test('creates a sql file', () => {
    migrator.create('sql')

    expect(syncer.read()).toMatchInlineSnapshot(`
      Object {
        "2000-01-01T00-00-00-000.sql.sql": "--sql (up)
      ",
        "down": Object {
          "2000-01-01T00-00-00-000.sql.sql": "--sql (down)
      ",
        },
      }
    `)
  })

  test('creates a js file', () => {
    migrator.create('javascript.js')

    expect(syncer.read()).toMatchInlineSnapshot(`
      Object {
        "2000-01-01T00-00-00-000.javascript.js": "exports.up = ({slonik, sql}) => slonik.query(sql\`select true\`)
      exports.down = ({slonik, sql}) => slonik.query(sql\`select true\`)
      ",
        "down": Object {},
      }
    `)
  })

  test('creates a ts file', () => {
    migrator.create('typescript.ts')

    expect(syncer.read()).toMatchInlineSnapshot(`
      Object {
        "2000-01-01T00-00-00-000.typescript.ts": "import {Migration} from '@slonik/migrator'

      export const up: Migration = ({slonik, sql}) => slonik.query(sql\`select true\`)
      export const down: Migration = ({slonik, sql}) => slonik.query(sql\`select true\`)
      ",
        "down": Object {},
      }
    `)
  })

  test(`mixed file types - uses last migration's file extension (not particularly recommneded!)`, () => {
    migrator.create('sql')

    migrator.create('javascript.js')
    migrator.create('javascript2.js')
    migrator.create('also-should-be-javascript')

    migrator.create('typescript.ts')
    migrator.create('also-should-be-typescript')

    migrator.create('more-sql.sql')
    migrator.create('also-should-be-sql')

    expect(syncer.read()).toMatchInlineSnapshot(`
      Object {
        "2000-01-01T00-00-00-000.sql.sql": "--sql (up)
      ",
        "2000-01-02T00-00-00-000.javascript.js": "exports.up = ({slonik, sql}) => slonik.query(sql\`select true\`)
      exports.down = ({slonik, sql}) => slonik.query(sql\`select true\`)
      ",
        "2000-01-03T00-00-00-000.javascript2.js": "exports.up = ({slonik, sql}) => slonik.query(sql\`select true\`)
      exports.down = ({slonik, sql}) => slonik.query(sql\`select true\`)
      ",
        "2000-01-04T00-00-00-000.also-should-be-javascript.js": "exports.up = ({slonik, sql}) => slonik.query(sql\`select true\`)
      exports.down = ({slonik, sql}) => slonik.query(sql\`select true\`)
      ",
        "2000-01-05T00-00-00-000.typescript.ts": "import {Migration} from '@slonik/migrator'

      export const up: Migration = ({slonik, sql}) => slonik.query(sql\`select true\`)
      export const down: Migration = ({slonik, sql}) => slonik.query(sql\`select true\`)
      ",
        "2000-01-06T00-00-00-000.also-should-be-typescript.ts": "import {Migration} from '@slonik/migrator'

      export const up: Migration = ({slonik, sql}) => slonik.query(sql\`select true\`)
      export const down: Migration = ({slonik, sql}) => slonik.query(sql\`select true\`)
      ",
        "2000-01-07T00-00-00-000.more-sql.sql": "--more-sql (up)
      ",
        "2000-01-08T00-00-00-000.also-should-be-sql.sql": "--also-should-be-sql (up)
      ",
        "down": Object {
          "2000-01-01T00-00-00-000.sql.sql": "--sql (down)
      ",
          "2000-01-07T00-00-00-000.more-sql.sql": "--more-sql (down)
      ",
          "2000-01-08T00-00-00-000.also-should-be-sql.sql": "--also-should-be-sql (down)
      ",
        },
      }
    `)
  })
})

// https://github.com/gajus/slonik/issues/63#issuecomment-500889445
afterAll(() => new Promise(r => setTimeout(r, 1)))
