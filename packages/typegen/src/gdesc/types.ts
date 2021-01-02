import * as slonik from 'slonik'

export interface GdescriberParams {
  /**
   * How to execute `psql` from the machine running this tool.
   *
   * Note: It's not recommended to run this tool against a production database, even though it doesn't perform any dynamic queries.
   *
   * Some example values:
   *
   * Scenario                             | Command
   * -------------------------------------|-------------------------------------------------------------------------
   * running postgres directly            | `psql -h localhost -U postgres postgres`
   * running postgres with docker-compose | `docker-compose exec -T postgres psql -h localhost -U postgres postgres`
   *
   * ___
   *
   * You can test this by running `echo 'select 123' | ${your_psqlCommand} -f -`
   *
   * e.g. `echo 'select 1 as a, 2 as b' | docker-compose exec -T postgres psql -h localhost -U postgres postgres -f -`
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

  rootDir: string

  /**
   * Files to look for SQL queries in. e.g. `source/queries/*.ts`
   * Also allows passing `cwd` and `ignore` strings e.g. `['source/*.ts', {ignore: ['source/*.test.ts']}]`
   * Defaults to all JavaScript and TypeScript files, ignoring node_modules.
   */
  glob: string | [string, {ignore?: string[]}?]

  /**
   * Map from a psql type description to a TypeScript type representation.
   * @default @see defaultPGDataTypeToTypeScriptMappings
   */
  gdescToTypeScript: (gdesc: string, typeName: string) => string | undefined

  /**
   * TypeScript type when no mapping is found. This should usually be `unknown` (or `any` if you like to live dangerously).
   */
  defaultType: string

  /**
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
  extractQueries: (file: string) => Array<ExtractedQuery>

  /**
   * How to write types which have been collected by psql. Usually you'll want to write to disk, but this can be any side-effect.
   * You could write to stdout instead, or throw an error if any new types are detected in CI. In theory you could event use this
   * to write some code in another language instead.
   * @default @see defaultWriteTypes
   */
  writeTypes: (queries: DescribedQuery[]) => void

  /**
   * Slonik pool instance. By default uses localhost.
   */
  pool: slonik.DatabasePoolType

  /**
   * List of `slonik.TypeParserType` objects, as passed into slonik. These should each have an extra `typescript` string property,
   * which indicates what type the parse into.
   *
   * e.g. for a slonik type parser
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
  typeParsers: Array<TypeScriptTypeParser>
}

export interface ExtractedQuery {
  text: string
  /** Path to file containing the query, relative to cwd */
  file: string
  /** Query SQL */
  sql: string
  /** Query SQL template parts. e.g. `['select * from users where name = ', ' and dob < ', '']` */
  template: string[]
}

export interface ParsedQuery extends ExtractedQuery {
  // suggestedTag: string
  // columns: ParsedColumn[]
}

// todo: use a sql ast parse to get the column name and maybe-table
// then query the db to get the table name and not-null status

export interface ParsedColumn {
  table?: string
  name: string
}

export interface DescribedQuery extends ParsedQuery {
  // /** Tag for the type. Usually this corresponds to an interface name for the query type */
  // tag: string
  /** List of meta objects with info about field types returned by this query */
  fields: QueryField[]
}

export interface QueryField {
  /** Field name. e.g. for `select foo, bar from baz` this will be `foo` or `bar` */
  name: string
  /** The description column returned by `psql ... \gdesc`. See https://www.postgresql.org/docs/11/app-psql.html  */
  gdesc: string
  /** The generated typescript type. based on `gdesc` */
  typescript: string
  /** For simple queries which just select from some known table, sometimes we can determine if they're not-null. */
  column?: ResolvedTableColumn
}

export interface ResolvedTableColumn extends ParsedColumn {
  table: string
  name: string
  notNull: boolean
}

export interface TypeScriptTypeParser extends slonik.TypeParserType {
  typescript: string
}
