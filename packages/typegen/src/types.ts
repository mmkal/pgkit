import {Client, ClientOptions} from '@pgkit/client'

/**
 * Options that can be specified in `typegen.config.js`. Each is optional (has a default value).
 * Those marked with @experimental are subject to change. If you want to use one of them, please post your use case
 * in https://github.com/mmkal/pgkit/discussions so it doesn't get broken/removed without a replacement.
 */
export interface Options {
  /**
   * URI for connecting to psql. Defaults to "postgresql://postgres:postgres@localhost:5432/postgres".
   *
   * Note: It's not recommended to run this tool against a production database, even though it doesn't perform any dynamic queries.
   */
  connectionString: string | Client
  /**
   * How to execute `psql` from the machine running this tool.
   *
   * Some example values:
   *
   * Scenario                             | Command
   * -------------------------------------|-------------------------------------------------------------------------
   * running postgres directly            | `psql`
   * running postgres with docker-compose | `docker-compose exec -T postgres psql`
   *
   * ___
   *
   * You can test this by running `echo 'select 123' | ${your_psqlCommand} -f -`
   *
   * e.g. `echo 'select 1 as a, 2 as b' | docker-compose exec -T postgres psql "postgresql://postgres:postgres@localhost:5432/postgres" -f -`
   *
   * You should see something like this printed:
   *
   * ```
   *  a | b
   * ---+---
   *  1 | 2
   * (1 row)
   * ```
   */
  psqlCommand: string

  /** Source root that the tool will search for files in. Defaults to `src`. */
  rootDir: string

  /**
   * @deprecated Use `include` and `exclude` options instead
   */
  glob?: never

  /**
   * Array of patterns of files to look for SQL queries in, e.g. `source/queries/*.ts`
   * Defaults to include all '.ts' and '.sql' files.
   */
  include: readonly string[]

  /**
   * Array of patterns to exclude from processing, e.g. `source/dont-touch/*.ts`
   * Defaults to exlude node_modules.
   */
  exclude: readonly string[]

  /**
   * Filter matcher results to files from specific git refs.
   * Use to match files changed since the given git ref. e.g. `'main'` or `'HEAD~1'`
   * This option has no effect in watch mode, as every file change constitutes a git diff.
   * Defaults to undefined (git filter disabled)
   */
  since: string | undefined

  /**
   * console-like logger which will output info, warning, error and debug messages. Defaults to `console`.
   */
  logger: Logger

  /**
   * If defined, before type generation, a pass will be done over all files to migrate them from codegen produced by this
   * tool, according to the specified semver range. e.g. if set to `<=0.8.0` files will be modified/deleted before the codegen
   * is run. Defaults to undefined (i.e. no migration).
   */
  migrate: '<=0.8.0' | undefined

  /**
   * @pgkit/client configuration. Defaults to empty. The configuration will be used to create a new pool, connecting to `connectionString`.
   */
  poolConfig: ClientOptions

  /**
   * @experimental
   * List of strings indicating when the git status should be checked to make sure it's clean, before modifying source code.
   * `['before-migrate', 'after']` by default - meaning the tool will ensure there are no unstaged changes before running any
   * legacy code migrations, and will also run after the tool has finished generating code. This ensures that when run in CI,
   * the job will fail if there are any changes that weren't included in the branch.
   */
  checkClean: Array<'before' | 'after' | 'before-migrate' | 'after-migrate' | 'none'>

  /**
   * @experimental
   * TypeScript type when no mapping is found. This should usually be `unknown` (or `any` if you like to live dangerously).
   */
  defaultType: string

  /**
   * @experimental
   * How to write types which have been collected by psql. Usually you'll want to write to disk, but this can be any side-effect.
   * You could write to stdout instead, or throw an error if any new types are detected in CI. In theory you could event use this
   * to write some code in another language instead.
   * @default @see defaultWriteTypes
   */
  writeTypes: (queries: AnalysedQuery[]) => Promise<void>

  /**
   * @experimental
   * How to map from a psql type description to a TypeScript type representation.
   * Return undefined to fall back on the default behaviour.
   * @default @see defaultPGDataTypeToTypeScriptMappings
   */
  pgTypeToTypeScript: (regtype: string) => string | undefined

  /**
   * @experimental
   * How to parse a file to get a list of SQL queries. By default, reads the file and uses naive regexes to
   * search for blocks looking like
   * @example
   * ```
   * pool.query(sql.SomeType`
   *   select foo
   *   from bar
   * `)
   * ```
   *
   * Which will parse to:
   *
   * ```
   * {tag: 'SomeType', file: 'path/to/file.ts', sql: 'select foo from bar'}
   * ```
   *
   * ___
   *
   * Tries to use typescript to parse input files and search for template tag expressions, and falls back to using naive regexes if
   * typescript isn't installed. Installing typescript will make the parsing more resilient to unusually-formatted queries with backticks
   * and/or nested template expressions.
   */
  extractQueries: (file: string) => ExtractedQuery[]

  /**
   * @experimental
   *
   * List of `TypeParser` objects, as passed into pgkit. These should each have an extra `typescript` string property,
   * which indicates what type the parse into.
   *
   * e.g. for a type parser
   * ```
   * { name: 'int8', parse: i => parseInt(i, 10) }
   * ```
   *
   * The equivalent type parser would be:
   * ```
   * { name: 'int8', parse: i => parseInt(i, 10), typescript: 'number' }
   * ```
   *
   * By default mimics the behavior of `slonik.createTypeParserPreset()`, so if you're only using the defaults (or you don't know!), you can leave this undefined.
   */
  typeParsers: TypeParserInfo[]
  /**
   * Skip initial processing of input files. Only useful with `watch`.
   */
  lazy?: boolean
  /**
   * Format thrown errors before logging. By default, uses `deepErrorCause` from `.//utils/errors`.
   */
  formatError: (e: unknown) => unknown
}

export type Logger = Record<'error' | 'warn' | 'info' | 'debug', (msg: unknown) => void>

export interface ExtractedQuery {
  type: 'extracted'
  text: string
  /** Path to file containing the query, relative to cwd */
  file: string
  /** Line number within file, 1-indexed */
  line: number
  /** Context of variables that this query appears inside. Used for naming */
  context: string[]
  /** Full source code of file containing query */
  source: string
  /** Query SQL */
  sql: string
  /** Query SQL template parts. e.g. `['select * from users where name = ', ' and dob < ', '']` */
  template: string[]
  /** Optional comment on the query e.g. `Fields from the user_role table, which maps role ids to user ids` */
  comment?: string
}

export interface ParsedColumn {
  table?: string
  name: string
}

export interface DescribedQuery extends ExtractedQuery {
  // /** Tag for the type. Usually this corresponds to an interface name for the query type */
  // tag: string
  /** List of meta objects with info about field types returned by this query */
  fields: QueryField[]
  parameters: QueryParameter[]
}

/** Info for a field in a query, from `psql ... \gdesc` */
export interface QueryField {
  /** Field name. e.g. for `select f as foo, b as bar from baz` this will be `foo` or `bar`. Not the underlying column name like `f` or `b`. */
  name: string
  /** The description column returned by `psql ... \gdesc`. See https://www.postgresql.org/docs/11/app-psql.html  */
  regtype: string
  /** The generated typescript type. based on `gdesc` */
  typescript: string
}

export interface QueryParameter {
  /** The name for the parameter. */
  name: string
  /** The postgres regtype for the parameter */
  regtype: string
  /** The generated typescript type. Based on `regtype` */
  typescript: string
}

export interface AnalysedQuery extends ExtractedQuery {
  suggestedTags: string[]
  /** List of meta objects with info about field types returned by this query */
  fields: AnalysedQueryField[]
  /** For `.sql` files only: List of parameters and their types */
  parameters: QueryParameter[]
}

export interface AnalysedQueryField extends QueryField {
  /**
   * true if the query field is *known* not to be null. This is only the case when the field comes directly from a
   * not-null table column, or is the return value of a common function like `count(*)`.
   */
  nullability: 'not_null' | 'assumed_not_null' | 'nullable' | 'nullable_via_join' | 'unknown'
  /** schema, table and column identifier string the field corresponds to, if any. e.g. `my_schema.my_table.my_column`. This is undefined for non-table-column fields.  */
  column: {schema: string; table: string; name: string} | undefined
  /**
   * The postgres comment applied to the field, e.g. with `comment on column my_table.my_column is 'Some helpful context about the column'`.
   * This will be mapped to a jsdoc comment on generated types.
   */
  comment: string | undefined
}

export interface TaggedQuery extends AnalysedQuery {
  tag: string
}

export interface ResolvedTableColumn {}

/** Corresponds to a @see TypeParser */
export interface TypeParserInfo {
  oid: number
  /** Corresponds to @see TypeParser.name */
  // pgtype: string
  /** The TypeScript type that the @see TypeParser transforms values to. */
  typescript: string
}
