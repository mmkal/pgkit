import * as gdesc from '../src/gdesc'
import {getPoolHelper} from '@slonik/migrator/test/pool-helper'

export const getHelper = (params: {__filename: string}) => {
  const poolHelper = getPoolHelper(params)
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(console.warn),
    error: jest.fn(console.error),
  }

  const gdescParams = (baseDir: string): Partial<gdesc.Options> => ({
    rootDir: baseDir,
    pool: poolHelper.pool,
    psqlCommand: `docker-compose exec -T postgres psql "postgresql://postgres:postgres@localhost:5432/postgres?options=--search_path%3d${poolHelper.schemaName}"`,
    logger,
  })

  jest.setTimeout(30000)

  return {gdescParams, poolHelper, logger}
}
