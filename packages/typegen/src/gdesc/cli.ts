import * as cli from '@rushstack/ts-command-line'
import {gdescriber} from './index'
import * as fs from 'fs'
import * as path from 'path'
import {tryOrNull} from './util'
import * as defaults from './defaults'

export class SlonikTypegenCLI extends cli.CommandLineParser {
  constructor() {
    super({
      toolFilename: 'slonik-typegen',
      toolDescription: `CLI for https://npmjs.com/package/@slonik/typegen.`,
    })

    this.addAction(new GenerateAction())
  }

  onDefineParameters() {}
}
export class GenerateAction extends cli.CommandLineAction {
  private _params!: ReturnType<typeof GenerateAction._defineParameters>

  constructor() {
    super({
      actionName: 'generate',
      summary: `Scans source files for SQL queries and generates TypeScript interfaces for them.`,
      documentation: `
        Generates a directory containing with a 'sql' tag wrapper based on found queries found in source files.
        By default, searches 'src' for source files and generates code under 'src/generated/db'.
      `,
    })
  }

  private static _defineParameters(action: cli.CommandLineAction) {
    return {
      options: action.defineStringParameter({
        parameterLongName: '--options',
        argumentName: 'PATH',
        description: `
          Path to a module containing parameters to be passed to 'gdescriber'. If specified, it will be required
          and the default export will be used as parameters. If not specified, defaults will be used.
          Note: other CLI arguments will override values set in this module
        `,
      }),
      rootDir: action.defineStringParameter({
        parameterLongName: '--root-dir',
        argumentName: 'PATH',
        description: `Path to the source directory containing SQL queries. Defaults to 'src if no value is provided`,
      }),
      psql: action.defineStringParameter({
        parameterLongName: '--psql',
        argumentName: 'COMMAND',
        description: `
          psql command used to query postgres via CLI client. e.g. 
          'psql -h localhost -U postgres postgres' if running postgres locally, or 
          'docker-compose exec -T postgres psql -h localhost -U postgres postgres' if running with docker-compose. 
          You can test this by running "<<your_psql_command>> -c 'select 1 as a, 2 as b'". Note that this command will 
          be executed dynamically, so avoid using any escape characters in here.
        `,
      }),
      defaultType: action.defineStringParameter({
        parameterLongName: '--default-type',
        argumentName: 'TYPESCRIPT',
        description: `
          TypeScript fallback type for when no type is found. Most simple types (text, int etc.)
          are mapped to their TypeScript equivalent automatically. This should usually be 'unknown',
          or 'any' if you like to live dangerously.
        `,
      }),
      glob: action.defineStringParameter({
        parameterLongName: '--glob',
        argumentName: 'PATTERN',
        description: `
          Glob pattern of source files to search for SQL queries in. By default searches for all ts, js,
          sql, cjs and mjs files under 'rootDir'
        `,
      }),
    }
  }

  onDefineParameters(): void {
    this._params = GenerateAction._defineParameters(this)
  }

  async onExecute() {
    let optionsModule = this._params.options.value
      ? require(path.resolve(process.cwd(), this._params.options.value))
      : tryOrNull(() => require(path.resolve(process.cwd(), defaults.typegenConfigFile)))

    const options = optionsModule?.default || optionsModule

    return gdescriber({
      ...options,
      rootDir: this._params.rootDir.value,
      psqlCommand: this._params.psql.value,
      defaultType: this._params.defaultType.value,
      glob: this._params.glob.value,
    })
  }
}

if (require.main === module) {
  new SlonikTypegenCLI().execute()
}
