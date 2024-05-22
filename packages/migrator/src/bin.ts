#!/usr/bin/env node

import tasuku from 'tasuku'
import {getMigratorFromEnv, createMigratorCli} from './cli'

const migrator = getMigratorFromEnv()

const cli = createMigratorCli(migrator)

// eslint-disable-next-line unicorn/prefer-top-level-await
void migrator.configStorage.run({logger: console, task: tasuku}, async () => {
  const result = await cli()
  if (result != null) migrator.logger.info(result)
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit()
})
