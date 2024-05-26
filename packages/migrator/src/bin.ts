#!/usr/bin/env node

import tasuku from 'tasuku'
import {getMigratorFromEnv} from './cli'

const migrator = getMigratorFromEnv()

void migrator.configStorage.run({task: tasuku}, async () => {
  await migrator.cli().run()
})
