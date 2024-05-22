#!/usr/bin/env node

import tasuku from 'tasuku'
import {getMigratorFromEnv} from './cli'

const migrator = getMigratorFromEnv()

void migrator.configStorage.run({logger: console, task: tasuku}, async () => {
  await migrator.cli().run({logger: migrator.logger})
})
