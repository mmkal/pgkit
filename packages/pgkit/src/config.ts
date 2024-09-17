import {type Options as TypegenOptions} from '@pgkit/typegen'
import * as fs from 'fs'
import * as path from 'path'

export type Config = {
  client: {
    connectionString: string
  }
  typegen?: Partial<TypegenOptions>
  migrator?: {
    connectionString?: string
    /** @default '${cwd}/migrations' */
    migrationTableName?: string
    /** @default 'migrations' */
    migrationsPath?: string
  }
}

export const defineConfig = (config: Config) => config

export const loadConfig = async (): Promise<Config> => {
  const importx = await import('importx') // todo: consider c12 instead
  const configLocations = ['pgkit.config.ts', 'pgkit.config.js']
  let config: Config | undefined
  let cwd = process.cwd()
  while (!config) {
    for (const configLocation of configLocations) {
      const filepath = path.join(cwd, configLocation)
      if (fs.existsSync(filepath)) {
        config = await importx.import(filepath, {
          parentURL: new URL(`file://${cwd}`),
        })
        while ((config as {default?: Config}).default) {
          config = (config as {default?: Config}).default
        }
        if (!config) {
          throw new Error(`Config file ${filepath} doesn't export a valid config object.`)
        }
        break
      }
    }
    cwd = path.dirname(cwd)
  }

  if (!config) {
    throw new Error(`No config file found. Try creating one at ${path.join(cwd, configLocations[0])}`)
  }

  return config
}
