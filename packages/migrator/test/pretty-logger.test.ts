/* eslint-disable no-console */
import {describe, expect, test, vi as jest, beforeEach, afterEach} from 'vitest'
import {Migrator} from './migrator'

const {prettyLogger} = Migrator

describe('prettyLogger', () => {
  const originals = {...console}

  beforeEach(() => {
    console.info = jest.fn()
    console.debug = jest.fn()
    console.warn = jest.fn()
    console.error = jest.fn()
  })

  afterEach(() => {
    Object.assign(console, originals)
  })

  test('known events', () => {
    prettyLogger.info({event: 'created', path: './db/migrations/2022.08.25T12.51.47.test.sql'})
    prettyLogger.info({event: 'migrating', name: '2022.08.25T12.51.47.test.sql'})
    prettyLogger.debug({event: 'migrated', name: '2022.08.25T12.51.47.test.sql', durationSeconds: 0.024})
    prettyLogger.debug({event: 'up', message: 'applied 1 migrations.'})
    prettyLogger.warn({event: 'reverting', name: '2022.08.25T12.51.47.test.sql'})
    prettyLogger.warn({event: 'reverted', name: '2022.08.25T12.51.47.test.sql', durationSeconds: 0.026})
    prettyLogger.error({event: 'down', message: 'reverted 1 migrations.'})

    expect((console.info as any).mock.calls[0][0]).toBe('created   ./db/migrations/2022.08.25T12.51.47.test.sql')
    expect((console.info as any).mock.calls[1][0]).toBe('migrating 2022.08.25T12.51.47.test.sql')
    expect((console.debug as any).mock.calls[0][0]).toBe('migrated  2022.08.25T12.51.47.test.sql in 0.024 s')
    expect((console.debug as any).mock.calls[1][0]).toBe('up migration completed, applied 1 migrations.')
    expect((console.warn as any).mock.calls[0][0]).toBe('reverting 2022.08.25T12.51.47.test.sql')
    expect((console.warn as any).mock.calls[1][0]).toBe('reverted  2022.08.25T12.51.47.test.sql in 0.026 s')
    expect((console.error as any).mock.calls[0][0]).toBe('down migration completed, reverted 1 migrations.')
  })

  test('known events with additional parameters', () => {
    prettyLogger.info({event: 'up', message: 'applied 1 migrations.', totalMigrations: 10})

    expect((console.info as any).mock.calls[0][0]).toBe('up migration completed, applied 1 migrations.')
    expect((console.info as any).mock.calls[1][0]).toEqual({totalMigrations: 10})
  })

  test('unknown events', () => {
    prettyLogger.info({event: 'finished', message: 'process finished.', durationSeconds: 0.1})

    expect((console.info as any).mock.calls[0][0]).toEqual({
      event: 'finished',
      message: 'process finished.',
      durationSeconds: 0.1,
    })
  })

  test('invalid parameters', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-argument */
    prettyLogger.info(null as any)
    prettyLogger.info(undefined as any)
    prettyLogger.info(0 as any)
    prettyLogger.info('1' as any)
    /* eslint-enable @typescript-eslint/no-unsafe-argument */

    expect((console.info as any).mock.calls).toEqual([[null], [undefined], [0], ['1']])
  })
})
