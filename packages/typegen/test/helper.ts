import * as typegen from '../src'
import {getPoolHelper} from '@slonik/migrator/test/pool-helper'

export const baseConnectionURI = `postgresql://postgres:postgres@localhost:5432/postgres`
export const psqlCommand = `docker-compose exec -T postgres psql`

export const getHelper = (params: {__filename: string}) => {
  const poolHelper = getPoolHelper({...params, baseConnectionURI})
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(console.warn),
    error: jest.fn(console.error),
  }

  const gdescParams = (baseDir: string): Partial<typegen.Options> => ({
    rootDir: baseDir,
    connectionURI: `${baseConnectionURI}?options=--search_path%3d${poolHelper.schemaName}`,
    pool: poolHelper.pool,
    psqlCommand,
    logger,
  })

  jest.setTimeout(30000)

  return {gdescParams, poolHelper, logger}
}
