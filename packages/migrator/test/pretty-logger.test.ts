import {SlonikMigrator} from '../src'

const {prettyLogger} = SlonikMigrator

describe('prettyLogger', () => {
  const originalInfo = console.info
  const originalDebug = console.debug
  const originalWarn = console.warn
  const originalError = console.error

  beforeEach(() => {
    console.info = jest.fn()
    console.debug = jest.fn()
    console.warn = jest.fn()
    console.error = jest.fn()
  })

  afterEach(() => {
    console.info = originalInfo
    console.debug = originalDebug
    console.warn = originalWarn
    console.error = originalError
  })

  test('known events', () => {
    prettyLogger.info({event: 'created', path: './db/migrations/2022.08.25T12.51.47.test.sql'})
    prettyLogger.info({event: 'migrating', name: '2022.08.25T12.51.47.test.sql'})
    prettyLogger.debug({event: 'migrated', name: '2022.08.25T12.51.47.test.sql', durationSeconds: 0.024})
    prettyLogger.debug({event: 'up', message: 'applied 1 migrations.'})
    prettyLogger.warn({event: 'reverting', name: '2022.08.25T12.51.47.test.sql'})
    prettyLogger.warn({event: 'reverted', name: '2022.08.25T12.51.47.test.sql', durationSeconds: 0.026})
    prettyLogger.error({event: 'down', message: 'reverted 1 migrations.'})

    expect((console.info as jest.Mock).mock.calls[0][0]).toBe('created   ./db/migrations/2022.08.25T12.51.47.test.sql')
    expect((console.info as jest.Mock).mock.calls[1][0]).toBe('migrating 2022.08.25T12.51.47.test.sql')
    expect((console.debug as jest.Mock).mock.calls[0][0]).toBe('migrated  2022.08.25T12.51.47.test.sql in 0.024 s')
    expect((console.debug as jest.Mock).mock.calls[1][0]).toBe('up migration completed, applied 1 migrations.')
    expect((console.warn as jest.Mock).mock.calls[0][0]).toBe('reverting 2022.08.25T12.51.47.test.sql')
    expect((console.warn as jest.Mock).mock.calls[1][0]).toBe('reverted  2022.08.25T12.51.47.test.sql in 0.026 s')
    expect((console.error as jest.Mock).mock.calls[0][0]).toBe('down migration completed, reverted 1 migrations.')
  })

  test('known events with additional parameters', () => {
    prettyLogger.info({event: 'up', message: 'applied 1 migrations.', totalMigrations: 10})

    expect((console.info as jest.Mock).mock.calls[0][0]).toBe('up migration completed, applied 1 migrations.')
    expect((console.info as jest.Mock).mock.calls[1][0]).toEqual({totalMigrations: 10})
  })

  test('unknown events', () => {
    prettyLogger.info({event: 'finished', message: 'process finished.', durationSeconds: 0.1})

    expect((console.info as jest.Mock).mock.calls[0][0]).toEqual({
      event: 'finished',
      message: 'process finished.',
      durationSeconds: 0.1,
    })
  })

  test('invalid parameters', () => {
    prettyLogger.info(null as any)
    prettyLogger.info(undefined as any)
    prettyLogger.info(0 as any)
    prettyLogger.info('1' as any)

    expect((console.info as jest.Mock).mock.calls).toEqual([[null], [undefined], [0], ['1']])
  })
})
