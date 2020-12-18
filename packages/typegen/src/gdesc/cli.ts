import * as cli from '@rushstack/ts-command-line'
import {gdescriber} from './index'
import * as path from 'path'

export interface CommandLineParserOptions {
  toolFileName?: string
  toolDescription?: string
}

export class SlonikTypegenCLI extends cli.CommandLineParser {
  private _params!: ReturnType<typeof SlonikTypegenCLI._defineParameters>

  constructor() {
    super({
      toolFilename: 'slonik-typegen',
      toolDescription: 'Scans source files for sql queries and generates typescript interfaces for them.',
    })
  }

  private static _defineParameters(action: cli.CommandLineParser) {
    return {
      options: action.defineStringParameter({
        parameterLongName: '--options',
        argumentName: 'PATH',
        description:
          `Path to a module containing parameters to be passed to 'gdescriber'. If specified, it will be required ` +
          `and the default export will be used as parameters. If not specified, defaults will be used. ` +
          `Note: other CLI arguments will override values set in this module`,
      }),
      rootDir: action.defineStringParameter({
        parameterLongName: '--root-dir',
        argumentName: 'RELATIVEPATH',
        description:
          'Relative path from CWD to the source directory that contains SQL queries. ' +
          'Defaults to `src` if no value is provided',
      }),
      psql: action.defineStringParameter({
        parameterLongName: '--psql',
        argumentName: 'COMMAND',
        description: `psql command`,
      }),
      defaultType: action.defineStringParameter({
        parameterLongName: '--default-type',
        argumentName: 'TYPESCRIPT',
        description:
          `TypeScript fallback type for when no type is found. Most simple types (text, int etc.)` +
          `Are mapped to their TypeScript equivalent automatically. This should usually be 'unknown', ` +
          `or 'any' if you like to live dangerously.`,
      }),
      glob: action.defineStringParameter({
        parameterLongName: '--glob',
        argumentName: 'PATTERN',
        description:
          `Glob pattern of source files to search for SQL queries in. By default searches for all ts, js, ` +
          'sql, cjs and mjs files under `rootDir`',
      }),
    }
  }

  onDefineParameters(): void {
    this._params = SlonikTypegenCLI._defineParameters(this)
  }

  async onExecute() {
    const options = this._params.options.value
      ? require(path.resolve(process.cwd(), this._params.options.value)).default
      : {}
    return gdescriber({
      ...options,
      rootDir: this._params.rootDir.value,
      psqlCommand: this._params.psql.value,
      defaultType: this._params.defaultType.value,
      glob: this._params.glob.value,
    })
  }
}
