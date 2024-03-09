/* eslint-disable mmkal/@typescript-eslint/brace-style */
/* eslint-disable mmkal/unicorn/prefer-ternary */
/* eslint-disable mmkal/@typescript-eslint/padding-line-between-statements */
/* eslint-disable max-lines */
/* eslint-disable prefer-const */
/* eslint-disable guard-for-in */
/* eslint-disable mmkal/@typescript-eslint/restrict-plus-operands */
/* eslint-disable mmkal/@typescript-eslint/no-unused-vars */
// No direct equivalent for textwrap in TypeScript. You might need a custom function or a library for similar functionality.

// Assuming these are local files that export the corresponding classes or functions
import {Queryable, createClient, sql} from '@pgkit/client'
import * as path from 'path'
import {AutoThisAssigner} from '../auto-this'
import {TopologicalSorter} from '../graphlib'
import {ColumnInfo, Inspected, BaseInspectedSelectable, TableRelated, getQuotedFullTableName, pick} from '../inspected'
import {DBInspector} from '../inspector'
import {asa, isa} from '../isa-asa'
import {quoted_identifier, getResourceText} from '../misc'
import {Queries} from '../types'
import {groupBy, isEqual} from '../util'

// keep close to the python by fiddling with __dirname
// __dirname=/foo/bar/{src,dist}/pg -> /foo/bar/queries/pg
// no plans to support anything other than pg but may as well keep it similar to the original
const resource_text = getResourceText(path.join(__dirname, '../../queries', path.basename(__dirname)))

// const textwrap = String

const CREATE_TABLE = `
  create {}table {} ({}
      ){}{};
`
const CREATE_TABLE_SUBCLASS = `
  create {}table {} partition of {} {};
`
const CREATE_FUNCTION_FORMAT = `
  create or replace function {signature}
      returns {result_string} as
      $$ {definition} $$
      language {language} {volatility} {strictness} {security_type};
`

const ALL_RELATIONS_QUERY = resource_text('sql/relations.sql')
const ALL_RELATIONS_QUERY_9 = resource_text('sql/relations9.sql')
const SCHEMAS_QUERY = resource_text('sql/schemas.sql')
const INDEXES_QUERY = resource_text('sql/indexes.sql')
const SEQUENCES_QUERY = resource_text('sql/sequences.sql')
const CONSTRAINTS_QUERY = resource_text('sql/constraints.sql')
const FUNCTIONS_QUERY = resource_text('sql/functions.sql')
const TYPES_QUERY = resource_text('sql/types.sql')
const DOMAINS_QUERY = resource_text('sql/domains.sql')
const EXTENSIONS_QUERY = resource_text('sql/extensions.sql')
const ENUMS_QUERY = resource_text('sql/enums.sql')
  // deviation: node-postgres doesn't parse enum arrays to js arrays: https://github.com/brianc/node-pg-types/issues/56 https://github.com/vitaly-t/pg-promise/issues/716
  .replace('SELECT e.enumlabel', 'SELECT e.enumlabel::text')
const DEPS_QUERY = resource_text('sql/deps.sql')
const PRIVILEGES_QUERY = resource_text('sql/privileges.sql')
const TRIGGERS_QUERY = resource_text('sql/triggers.sql')
const COLLATIONS_QUERY = resource_text('sql/collations.sql')
const COLLATIONS_QUERY_9 = resource_text('sql/collations9.sql')
const RLSPOLICIES_QUERY = resource_text('sql/rlspolicies.sql')
  // deviation: node-postgres doesn't parse unknown types to js arrays: https://github.com/brianc/node-pg-types/issues/56 https://github.com/vitaly-t/pg-promise/issues/716
  .replace('pg_get_userbyid(o)', 'pg_get_userbyid(o)::text')

function format(formatString: string, ...args: any[]): string {
  return formatString.replaceAll('{}', () => {
    return String(args.shift())
  })
}

export class InspectedSelectable extends BaseInspectedSelectable {
  has_compatible_columns(other: InspectedSelectable): boolean {
    function names_and_types(cols: InspectedSelectable['columns']) {
      return Object.entries(cols).map(([k, c]) => [k, c.dbtype])
    }

    let items = names_and_types(this.columns)

    if (this.relationtype !== 'f') {
      const old_arg_count = Object.keys(other.columns).length
      items = items.slice(0, old_arg_count)
    }

    return isEqual(items, names_and_types(other.columns))
  }

  can_replace(other: InspectedSelectable): boolean {
    if (!(['v', 'f'].includes(this.relationtype) || this.is_table)) {
      return false
    }

    if (this.signature !== other.signature) {
      return false
    }

    if (this.relationtype !== other.relationtype) {
      return false
    }

    return this.has_compatible_columns(other)
  }

  get persistence_modifier(): string {
    if (this.persistence === 't') {
      return 'temporary '
    }

    if (this.persistence === 'u') {
      return 'unlogged '
    }

    return ''
  }

  get is_unlogged(): boolean {
    return this.persistence === 'u'
  }

  get create_statement(): string {
    const n = this.quoted_full_name
    let create_statement: string

    if (['r', 'p'].includes(this.relationtype)) {
      if (this.is_partitioning_child_table) {
        create_statement = format(
          CREATE_TABLE_SUBCLASS,
          this.persistence_modifier,
          n,
          this.parent_table,
          this.partition_def,
        )
      } else {
        let colspec = Object.values(this.columns)
          .map(c => '    ' + c.creation_clause)
          .join(',\n')
        if (colspec) {
          colspec = '\n' + colspec
        }

        let partition_key = ''
        let inherits_clause = ''

        if (this.partition_def) {
          partition_key = ' partition by ' + this.partition_def
        } else if (this.parent_table) {
          inherits_clause = ` inherits (${this.parent_table})`
        }

        create_statement = format(CREATE_TABLE, this.persistence_modifier, n, colspec, partition_key, inherits_clause)
      }
    } else
      switch (this.relationtype) {
        case 'v': {
          create_statement = `create or replace view ${n} as ${this.definition}\n`

          break
        }

        case 'm': {
          create_statement = `create materialized view ${n} as ${this.definition}\n`

          break
        }

        case 'c': {
          const colspec = Object.values(this.columns)
            .map(c => c.creation_clause)
            .join(', ')
          create_statement = `create type ${n} as (${colspec});`

          break
        }

        default: {
          throw new Error('Not implemented')
        }
      }

    return create_statement
  }

  get drop_statement(): string {
    const n = this.quoted_full_name
    let drop_statement: string

    if (['r', 'p'].includes(this.relationtype)) {
      drop_statement = `drop table ${n};`
    } else
      switch (this.relationtype) {
        case 'v': {
          drop_statement = `drop view if exists ${n};`

          break
        }

        case 'm': {
          drop_statement = `drop materialized view if exists ${n};`

          break
        }

        case 'c': {
          drop_statement = `drop type ${n};`

          break
        }

        default: {
          throw new Error(`relationtype ${this.relationtype} not implemeneted`)
        }
      }

    return drop_statement
  }

  alter_table_statement(clause: string): string {
    if (this.is_alterable) {
      const alter = `alter table ${this.quoted_full_name} ${clause};`
      return alter
    }

    throw new Error('Not implemented')
  }

  get is_partitioned(): boolean {
    return this.relationtype === 'p'
  }

  get is_inheritance_child_table(): boolean {
    return Boolean(this.parent_table) && !this.partition_def
  }

  get is_table(): boolean {
    return ['p', 'r'].includes(this.relationtype)
  }

  get is_alterable(): boolean {
    return this.is_table && (!this.parent_table || this.is_inheritance_child_table)
  }

  get contains_data(): boolean {
    return Boolean(this.relationtype === 'r' && (this.parent_table || !this.partition_def))
  }

  // for back-compat only
  get is_child_table(): boolean {
    return this.is_partitioning_child_table
  }

  get is_partitioning_child_table(): boolean {
    return Boolean(this.relationtype === 'r' && this.parent_table && this.partition_def)
  }

  get uses_partitioning(): boolean {
    return this.is_partitioning_child_table || this.is_partitioned
  }

  get attach_statement(): string | undefined {
    if (this.parent_table) {
      if (this.partition_def) {
        // deviation: python refers to self.partition_spec, typo?
        return `alter table ${this.quoted_full_name} attach partition ${this.parent_table} ${this.partition_def};`
      }

      return `alter table ${this.quoted_full_name} inherit ${this.parent_table}`
    }

    return undefined
  }

  get detach_statement(): string | undefined {
    if (this.parent_table) {
      if (this.partition_def) {
        return `alter table ${this.parent_table} detach partition ${this.quoted_full_name};`
      }

      return `alter table ${this.quoted_full_name} no inherit ${this.parent_table}`
    }

    return undefined
  }

  attach_detach_statements(before: typeof this): string[] {
    const slist: string[] = []
    if (this.parent_table !== before.parent_table) {
      if (before.parent_table) {
        slist.push(before.detach_statement)
      }

      if (this.parent_table) {
        slist.push(this.attach_statement)
      }
    }

    return slist
  }

  get alter_rls_clause(): string {
    const keyword = this.rowsecurity ? 'enable' : 'disable'
    return `${keyword} row level security`
  }

  get alter_rls_statement(): string {
    return this.alter_table_statement(this.alter_rls_clause)
  }

  get alter_unlogged_statement(): string {
    const keyword = this.is_unlogged ? 'unlogged' : 'logged'
    return this.alter_table_statement(`set ${keyword}`)
  }
}

export interface InspectedFunctionParams {
  name: string
  schema: string
  identity_arguments: string
  result_string: string
  language: string
  volatility: string
  strictness: string
  security_type: string
  full_definition: string
  returntype: string
  kind: string

  columns: Record<string, ColumnInfo>
  inputs: ColumnInfo[]
  definition: string
  comment: string
}
export class InspectedFunction extends AutoThisAssigner<InspectedFunctionParams, typeof InspectedSelectable>(
  InspectedSelectable,
) {
  constructor(options: InspectedFunctionParams) {
    super(options, {...options, relationtype: 'f'})
  }

  get returntype_is_table(): boolean {
    return this.returntype ? this.returntype.includes('.') : false
  }

  get signature(): string {
    return `${this.quoted_full_name}(${this.identity_arguments})`
  }

  get create_statement(): string {
    return `${this.full_definition};`
    /*
    return CREATE_FUNCTION_FORMAT({
        signature: this.signature,
        result_string: this.result_string,
        definition: this.definition,
        language: this.language,
        volatility: this.volatility,
        strictness: this.strictness,
        security_type: this.security_type,
    });
    */
  }

  get thing(): string {
    const kinds: Record<string, string> = {
      f: 'function',
      p: 'procedure',
      a: 'aggregate',
      w: 'window function',
    }
    return kinds[this.kind]
  }

  get drop_statement(): string {
    return `drop ${this.thing} if exists ${this.signature};`
  }

  equals(other: InspectedFunction): boolean {
    return (
      this.signature === other.signature &&
      this.result_string === other.result_string &&
      this.definition === other.definition &&
      this.language === other.language &&
      this.volatility === other.volatility &&
      this.strictness === other.strictness &&
      this.security_type === other.security_type &&
      this.kind === other.kind
    )
  }
}

export interface InspectedTriggerParams {
  name: string
  schema: string
  table_name: string
  proc_schema: string
  proc_name: string
  enabled: string
  full_definition: string
}
export class InspectedTrigger extends AutoThisAssigner<InspectedTriggerParams, typeof Inspected>(Inspected) {
  dependent_on: string[]
  dependents: any[]

  constructor(options: InspectedTriggerParams) {
    super(options)

    this.dependent_on = [this.quoted_full_selectable_name]
    this.dependents = []
  }

  get signature(): string {
    return this.quoted_full_name
  }

  get quoted_full_name(): string {
    return `${quoted_identifier(this.schema)}.${quoted_identifier(this.table_name)}.${quoted_identifier(this.name)}`
  }

  get quoted_full_selectable_name(): string {
    return `${quoted_identifier(this.schema)}.${quoted_identifier(this.table_name)}`
  }

  get drop_statement(): string {
    return `drop trigger if exists "${this.name}" on "${this.schema}"."${this.table_name}";`
  }

  get create_statement(): string {
    const status_sql: Record<string, string> = {
      O: 'ENABLE TRIGGER',
      D: 'DISABLE TRIGGER',
      R: 'ENABLE REPLICA TRIGGER',
      A: 'ENABLE ALWAYS TRIGGER',
    }
    const schema = quoted_identifier(this.schema)
    const table = quoted_identifier(this.table_name)
    const trigger_name = quoted_identifier(this.name)
    if (['D', 'R', 'A'].includes(this.enabled)) {
      const table_alter = `ALTER TABLE ${schema}.${table} ${status_sql[this.enabled]} ${trigger_name}`
      return `${this.full_definition};\n${table_alter};`
    }

    return `${this.full_definition};`
  }

  toJSON(): Record<string, unknown> {
    return pick(this, [
      'name', //
      'schema',
      'table_name',
      'proc_schema',
      'proc_name',
      'enabled',
      'full_definition',
    ])
  }
}

/** for types that are affected by postgres not parsing enum arrays to js arrays, but are only used for serialization/comparison anyway: https://github.com/brianc/node-pg-types/issues/56 https://github.com/vitaly-t/pg-promise/issues/716 */
type Arrayish = string | string[]

export interface InspectedIndexParams {
  name: string
  schema: string
  table_name: string
  key_columns: Arrayish
  key_options: Arrayish
  num_att: number
  is_unique: boolean
  is_pk: boolean
  is_exclusion: boolean
  is_immediate: boolean
  is_clustered: boolean
  key_collations: Arrayish
  key_expressions: Arrayish
  partial_predicate: string
  algorithm: string
  definition?: string
  constraint?: InspectedConstraint
  index_columns?: Arrayish
  included_columns?: Arrayish
}
export const InspectedIndexParent = AutoThisAssigner<InspectedIndexParams, typeof Inspected>(Inspected)
export class InspectedIndex extends InspectedIndexParent implements TableRelated {
  get quoted_full_table_name() {
    return getQuotedFullTableName(this)
  }

  get drop_statement(): string {
    const statement = `drop index if exists ${this.quoted_full_name};`

    if (this.is_exclusion_constraint) {
      return `select 1; \n-- ${statement}`
    }

    return statement
  }

  get create_statement(): string {
    const statement = `${this.definition};`
    if (this.is_exclusion_constraint) {
      return `select 1; \n-- ${statement}`
    }

    return statement
  }

  get is_exclusion_constraint(): boolean {
    return this.constraint && this.constraint.constraint_type === 'EXCLUDE'
  }

  toJSON(): Record<string, unknown> {
    const keys: Record<keyof InspectedIndexParams, boolean> = {
      name: true,
      schema: true,
      table_name: true,
      key_columns: true,
      key_options: true,
      num_att: true,
      is_unique: true,
      is_pk: true,
      is_exclusion: true,
      is_immediate: true,
      is_clustered: true,
      key_expressions: true,
      partial_predicate: true,
      algorithm: true,

      definition: true,
      constraint: true,
      included_columns: true,
      index_columns: true,
      key_collations: true,
    }
    return pick(
      this,
      (Object.keys(keys) as Array<keyof typeof keys>).filter(k => keys[k]),
    )
  }
}

export type InspectedSequenceParams = {name: string; schema: string; table_name?: string; column_name?: string}
export class InspectedSequence extends AutoThisAssigner<InspectedSequenceParams, typeof Inspected>(Inspected) {
  get drop_statement(): string {
    return `drop sequence if exists ${this.quoted_full_name};`
  }

  get create_statement(): string {
    return `create sequence ${this.quoted_full_name};`
  }

  get create_statement_with_ownership(): string {
    const t_col_name = this.quoted_table_and_column_name

    if (this.table_name && this.column_name) {
      return `create sequence ${this.quoted_full_name} owned by ${t_col_name};`
    }

    return `create sequence ${this.quoted_full_name};`
  }

  get alter_ownership_statement(): string {
    const t_col_name = this.quoted_table_and_column_name

    if (t_col_name) {
      return `alter sequence ${this.quoted_full_name} owned by ${t_col_name};`
    }

    return `alter sequence ${this.quoted_full_name} owned by none;`
  }

  get quoted_full_table_name(): string | undefined {
    if (this.table_name) {
      return quoted_identifier(this.table_name, this.schema)
    }

    return undefined
  }

  get quoted_table_and_column_name(): string | undefined {
    if (this.column_name && this.table_name) {
      return `${this.quoted_full_table_name}.${quoted_identifier(this.column_name)}`
    }

    return undefined
  }

  toJSON(): Record<string, unknown> {
    return pick(this, [
      'name', //
      'schema',
      'table_name',
      'column_name',
      // 'quoted_table_and_column_name', // todo: should probably drop this, I think it breaks fromJSON because there's only a getter
    ])
  }
}

export interface InspectedCollationParams {
  name: string
  schema: string
  provider: string
  encoding: number
  lc_collate: string
  lc_ctype: string
  version: string
}
export class InspectedCollation extends AutoThisAssigner<InspectedCollationParams, typeof Inspected>(Inspected) {
  get locale(): string {
    return this.lc_collate
  }

  get drop_statement(): string {
    return `drop collation if exists ${this.quoted_full_name};`
  }

  get create_statement(): string {
    return `create collation if not exists ${this.quoted_full_name} (provider = '${this.provider}', locale = '${this.locale}');`
  }

  toJSON(): Record<string, unknown> {
    return pick(this, [
      'name', //
      'schema',
      'provider',
      'lc_collate',
    ])
  }
}

export type InspectedEnumParams = {name: string; schema: string; elements: string[]; pg_version?: number}
export class InspectedEnum extends AutoThisAssigner<InspectedEnumParams, typeof Inspected>(Inspected) {
  dependents = []
  dependent_on = []

  get drop_statement(): string {
    return `drop type ${this.quoted_full_name};`
  }

  get create_statement(): string {
    return `create type ${this.quoted_full_name} as enum (${this.quoted_elements});`
  }

  get quoted_elements(): string {
    const quoted = this.elements.map(e => `'${e}'`)
    return quoted.join(', ')
  }

  alter_rename_statement(new_name: string): string {
    const name = new_name
    return `alter type ${this.quoted_full_name} rename to ${quoted_identifier(name)};`
  }

  drop_statement_with_rename(new_name: string): string {
    const name = new_name
    const new_name_quoted = quoted_identifier(name, this.schema)
    return `drop type ${new_name_quoted};`
  }

  change_statements(newEnum: InspectedEnum): string[] {
    if (!this.can_be_changed_to(newEnum)) {
      throw new Error('Cannot change enum')
    }

    const newElements = newEnum.elements
    const oldElements = this.elements
    const statements: string[] = []
    let previous: string | null = null

    for (const c of newElements) {
      if (!oldElements.includes(c)) {
        let s: string
        s = previous
          ? `alter type ${this.quoted_full_name} add value '${c}' after '${previous}';`
          : `alter type ${this.quoted_full_name} add value '${c}' before '${oldElements[0]}';`
        statements.push(s)
      }

      previous = c
    }

    return statements
  }

  can_be_changed_to(newEnum: InspectedEnum, when_within_transaction = false): boolean {
    const oldElements = this.elements

    if (when_within_transaction && this.pg_version && Number(this.pg_version) < 12) {
      return false
    }

    // new must already have the existing items from old, in the same order
    return newEnum.elements.filter(e => oldElements.includes(e)).toString() === oldElements.toString()
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      schema: this.schema,
      elements: this.elements,
    }
  }
}

export class InspectedSchema extends Inspected {
  constructor(options: {schema: string}) {
    super()

    this.name = null
    this.schema = options.schema
  }

  get create_statement(): string {
    return `create schema if not exists ${this.quoted_schema};`
  }

  get drop_statement(): string {
    return `drop schema if exists ${this.quoted_schema};`
  }

  get quoted_full_name(): string {
    return this.quoted_name
  }

  get quoted_name(): string {
    return quoted_identifier(this.schema)
  }

  toJSON(): Record<string, unknown> {
    return {schema: this.schema}
  }
}

export type InspectedTypeParams = {name: string; schema: string; columns: Record<string, string>}

export class InspectedType extends AutoThisAssigner<InspectedTypeParams, typeof Inspected>(Inspected) {
  get drop_statement(): string {
    return `drop type ${this.signature};`
  }

  get create_statement(): string {
    let sql = `create type ${this.signature} as (\n`

    const indent = ' '.repeat(4)
    const typespec = Object.entries(this.columns).map(([name, _type]) => `${indent}${quoted_identifier(name)} ${_type}`)

    sql += typespec.join(',\n')
    sql += '\n);'
    return sql
  }

  toJSON(): Record<string, unknown> {
    return {
      schema: this.schema,
      name: this.name,
      columns: this.columns,
    }
  }
}

export interface InspectedDomainParams {
  name: string
  schema: string
  data_type: string
  collation?: string
  constraint_name?: string
  not_null: boolean
  default?: string
  check?: string
}
export class InspectedDomain extends AutoThisAssigner<InspectedDomainParams, typeof Inspected>(Inspected) {
  get drop_statement(): string {
    return `drop domain ${this.signature};`
  }

  get create_statement(): string {
    const sql = `create domain ${this.signature}\nas ${this.data_type}\n${this.collation_clause}${this.default_clause}${this.nullable_clause}${this.check_clause}`
    return sql
  }

  get check_clause(): string {
    return this.check ? `${this.check}\n` : ''
  }

  get collation_clause(): string {
    return this.collation ? `collation ${this.collation}\n` : ''
  }

  get default_clause(): string {
    return this.default ? `default ${this.default}\n` : ''
  }

  get nullable_clause(): string {
    return this.not_null ? 'not null\n' : 'null\n'
  }

  toJSON(): Record<string, unknown> {
    return pick(this, [
      'schema', //
      'name',
      'data_type',
      'collation',
      'default',
      'constraint_name',
      'not_null',
      'check',
    ])
  }
}
export class InspectedExtension extends Inspected {
  version: string | null

  constructor({name, schema, version = null}: {name: string; schema: string; version?: string}) {
    super()
    this.name = name
    this.schema = schema
    this.version = version
  }

  get drop_statement(): string {
    return `drop extension if exists ${this.quoted_name};`
  }

  get create_statement(): string {
    const version_clause = this.version ? ` version '${this.version}'` : ''
    return `create extension if not exists ${this.quoted_name} with schema ${this.quoted_schema}${version_clause};`
  }

  get update_statement(): string | null {
    return this.version ? `alter extension ${this.quoted_name} update to '${this.version}';` : null
  }

  alter_statements(other?: InspectedExtension): string[] {
    return [this.update_statement]
  }

  unversioned_copy(): InspectedExtension {
    return new InspectedExtension({name: this.name, schema: this.schema})
  }

  toJSON(): Record<string, unknown> {
    return pick(this, ['name', 'schema', 'version'])
  }
}
export interface InspectedConstraintParams {
  name: string
  schema: string
  constraint_type: string
  table_name: string
  definition: string
  index: string
  is_fk?: boolean
  is_deferrable?: boolean
  initially_deferred?: boolean
}
const InspectedConstraintParent = AutoThisAssigner<InspectedConstraintParams, typeof Inspected>(Inspected)
export class InspectedConstraint extends InspectedConstraintParent implements TableRelated {
  quoted_full_foreign_table_name: string | null
  fk_columns_local: any | null
  fk_columns_foreign: any | null

  get quoted_full_table_name() {
    return getQuotedFullTableName(this)
  }

  constructor(params: InspectedConstraintParams) {
    super(params)
    this.quoted_full_foreign_table_name = null
    this.fk_columns_local = null
    this.fk_columns_foreign = null
  }

  get drop_statement(): string {
    return `alter table ${this.quoted_full_table_name} drop constraint ${this.quoted_name};`
  }

  get deferrable_subclause(): string {
    if (!this.is_deferrable) {
      return ''
    }

    let clause = ' DEFERRABLE'
    if (this.initially_deferred) {
      clause += ' INITIALLY DEFERRED'
    }

    return clause
  }

  get create_statement(): string {
    return this.get_create_statement(false)
  }

  get_create_statement(set_not_valid = false): string {
    let using_clause: string
    if (this.index && this.constraint_type !== 'EXCLUDE') {
      using_clause = `${this.constraint_type} using index ${this.quoted_name}${this.deferrable_subclause}`
    } else {
      using_clause = this.definition
      if (set_not_valid) {
        using_clause += ' not valid'
      }
    }

    return `alter table ${this.quoted_full_table_name} add constraint ${this.quoted_name} ${using_clause};`
  }

  get can_use_not_valid(): boolean {
    return (this.constraint_type === 'CHECK' || this.constraint_type === 'FOREIGN KEY') && !this.index
  }

  get validate_statement(): string | undefined {
    if (this.can_use_not_valid) {
      return `alter table ${this.quoted_full_table_name} validate constraint ${this.quoted_name};`
    }

    return undefined
  }

  get safer_create_statements(): string[] {
    if (!this.can_use_not_valid) {
      return [this.create_statement]
    }

    return [this.get_create_statement(true), this.validate_statement]
  }

  get quoted_full_name(): string {
    return `${quoted_identifier(this.schema)}.${quoted_identifier(this.table_name)}.${quoted_identifier(this.name)}`
  }

  toJSON(): Record<string, unknown> {
    return pick(this, [
      'name',
      'schema',
      'table_name',
      'constraint_type', // i commented this out at some point, but that meant toJSON/fromJSON doesn't work
      'definition',
      'index',
      'is_fk',
      'is_deferrable',
      'initially_deferred',
    ])
  }
}

export interface InspectedPrivilegeParams {
  object_type: string
  schema: string
  name: string
  privilege: string
  target_user: string
}
const InspectedPrivilegeParent = AutoThisAssigner<InspectedPrivilegeParams, typeof Inspected>(Inspected)
export class InspectedPrivilege extends InspectedPrivilegeParent {
  constructor(params: InspectedPrivilegeParams) {
    super(params)
    this.privilege = this.privilege.toLowerCase()
  }

  get quoted_target_user(): string {
    return quoted_identifier(this.target_user)
  }

  get drop_statement(): string {
    return `revoke ${this.privilege} on ${this.object_type} ${this.quoted_full_name} from ${this.quoted_target_user};`
  }

  get create_statement(): string {
    return `grant ${this.privilege} on ${this.object_type} ${this.quoted_full_name} to ${this.quoted_target_user};`
  }

  toJSON(): Record<string, unknown> {
    return pick(this, [
      'schema',
      'object_type', //
      'name',
      'privilege',
      'target_user',
    ])
  }

  get key(): [string, string, string, string] {
    return [this.object_type, this.quoted_full_name, this.target_user, this.privilege]
  }
}

export const RLS_POLICY_CREATE = `
  create policy {name}
  on {table_name}
  as {permissiveness}
  for {commandtype_keyword}
  to {roleslist}{qual_clause}{withcheck_clause};
`

export const COMMANDTYPES = {
  '*': 'all',
  r: 'select',
  a: 'insert',
  w: 'update',
  d: 'delete',
}

export interface InspectedRowPolicyParams {
  name: string
  schema: string
  table_name: string
  commandtype: string
  permissive: boolean
  roles: string[]
  qual: string | null
  withcheck: string | null
}
const InspectedRowPolicyParent = AutoThisAssigner<InspectedRowPolicyParams, typeof Inspected>(Inspected)
export class InspectedRowPolicy extends InspectedRowPolicyParent implements TableRelated {
  constructor(params: InspectedRowPolicyParams) {
    super(params)
    isa.array(this.roles, String) // make sure we worked around node-postgres doesn't parse unknown types to js arrays: https://github.com/brianc/node-pg-types/issues/56 https://github.com/vitaly-t/pg-promise/issues/716
  }

  get permissiveness(): string {
    return this.permissive ? 'permissive' : 'restrictive'
  }

  get commandtype_keyword(): string {
    return COMMANDTYPES[this.commandtype]
  }

  get quoted_full_table_name(): string {
    return getQuotedFullTableName(this)
  }

  get key(): string {
    return `${this.quoted_full_table_name}.${this.quoted_name}`
  }

  get create_statement(): string {
    const qual_clause = this.qual ? `\nusing (${this.qual})` : ''
    const withcheck_clause = this.withcheck ? `\nwith check (${this.withcheck})` : ''
    const roleslist = this.roles.join(', ')

    return RLS_POLICY_CREATE.replaceAll('{name}', this.quoted_name)
      .replaceAll('{table_name}', this.quoted_full_table_name)
      .replaceAll('{permissiveness}', this.permissiveness)
      .replaceAll('{commandtype_keyword}', this.commandtype_keyword)
      .replaceAll('{roleslist}', roleslist)
      .replaceAll('{qual_clause}', qual_clause)
      .replaceAll('{withcheck_clause}', withcheck_clause)
  }

  get drop_statement(): string {
    return `drop policy ${this.quoted_name} on ${this.quoted_full_table_name};`
  }

  toJSON(): Record<string, unknown> {
    return pick(this, [
      'name', //
      'schema',
      'permissiveness',
      'commandtype',
      'permissive',
      'roles',
      'qual',
      'withcheck',
    ])
  }
}

export const PROPS = [
  'schemas',
  'relations',
  'tables',
  'views',
  'functions',
  'selectables',
  'sequences',
  'constraints',
  'indexes',
  'enums',
  'extensions',
  'privileges',
  'collations',
  'triggers',
  'rlspolicies',
] as const

export interface PostgreSQLOptions {
  include_internal?: boolean
}
export class PostgreSQL extends DBInspector {
  is_raw_psyco_connection: boolean
  pg_version: number

  rlspolicies: Record<string, InspectedRowPolicy> = {}
  selectables: Record<string, InspectedSelectable> = {}
  enums: Record<string, InspectedEnum> = {}
  collations: Record<string, InspectedCollation> = {}
  privileges: Record<string, InspectedPrivilege> = {}
  tables: Record<string, InspectedSelectable> = {}
  constraints: Record<string, InspectedConstraint> = {}
  views: Record<string, InspectedSelectable> = {}
  materialized_views: Record<string, InspectedSelectable> = {}
  composite_types: Record<string, InspectedType> = {}
  relations: Record<string, InspectedSelectable> = {}
  indexes: Record<string, InspectedIndex> = {}
  schemas: Record<string, InspectedSchema> = {}
  sequences: Record<string, InspectedSequence> = {}
  deps: Queries['DEPS_QUERY']
  extensions: Record<string, InspectedExtension> = {}
  functions: Record<string, InspectedFunction> = {}
  triggers: Record<string, InspectedTrigger> = {}
  types: Record<string, InspectedType> = {}
  domains: Record<string, InspectedDomain> = {}

  ALL_RELATIONS_QUERY: string
  COLLATIONS_QUERY: string
  RLSPOLICIES_QUERY: string | null
  INDEXES_QUERY: string
  SEQUENCES_QUERY: string
  CONSTRAINTS_QUERY: string
  FUNCTIONS_QUERY: string
  TYPES_QUERY: string
  DOMAINS_QUERY: string
  EXTENSIONS_QUERY: string
  ENUMS_QUERY: string
  DEPS_QUERY: string
  SCHEMAS_QUERY: string
  PRIVILEGES_QUERY: string
  TRIGGERS_QUERY: string

  queryResults: Record<string, unknown[]> = {}

  private constructor(c: Queryable, options: PostgreSQLOptions = {}) {
    super(c, {include_internal: options.include_internal, i_remembered_to_call_initialize_super: true})

    this.is_raw_psyco_connection = false
    this.is_raw_psyco_connection = true // we don't have sqlalchemy so need to avoid it

    // let pg_version: number
    // try {
    //   pg_version = c.dialect.server_version_info[0]
    // } catch {
    //   pg_version = Number.parseInt(c.connection.server_version.toString().slice(0, -4), 10)
    const pg_version = 12
    this.is_raw_psyco_connection = true
    // }

    this.pg_version = pg_version

    const processed = (q: string) => {
      if (!q) {
        throw new Error(`Query is empty: ${q}`)
      }

      if (!options.include_internal) {
        q = q.replaceAll('-- SKIP_INTERNAL', '')
      }
      if (this.pg_version >= 11) {
        q = q.replaceAll('-- 11_AND_LATER', '')
      } else {
        q = q.replaceAll('-- 10_AND_EARLIER', '')
      }

      if (this.is_raw_psyco_connection) {
        q = q.replaceAll('\\:', ':')
      } else {
        throw new Error(`Not implemented: no sqlalchemy equivalent`)
      }

      return q
    }

    if (pg_version <= 9) {
      this.ALL_RELATIONS_QUERY = processed(ALL_RELATIONS_QUERY_9)
      this.COLLATIONS_QUERY = processed(COLLATIONS_QUERY_9)
      this.RLSPOLICIES_QUERY = null
    } else {
      let all_relations_query = ALL_RELATIONS_QUERY

      let replace: string
      replace = pg_version >= 12 ? '-- 12_ONLY' : '-- PRE_12'

      all_relations_query = all_relations_query.replaceAll(replace, '')
      this.ALL_RELATIONS_QUERY = processed(all_relations_query)
      this.COLLATIONS_QUERY = processed(COLLATIONS_QUERY)
      this.RLSPOLICIES_QUERY = processed(RLSPOLICIES_QUERY)
    }

    this.INDEXES_QUERY = processed(INDEXES_QUERY)
    this.SEQUENCES_QUERY = processed(SEQUENCES_QUERY)
    this.CONSTRAINTS_QUERY = processed(CONSTRAINTS_QUERY)
    this.FUNCTIONS_QUERY = processed(FUNCTIONS_QUERY)
    this.TYPES_QUERY = processed(TYPES_QUERY)
    this.DOMAINS_QUERY = processed(DOMAINS_QUERY)
    this.EXTENSIONS_QUERY = processed(EXTENSIONS_QUERY)
    this.ENUMS_QUERY = processed(ENUMS_QUERY)
    this.DEPS_QUERY = processed(DEPS_QUERY)
    this.SCHEMAS_QUERY = processed(SCHEMAS_QUERY)
    this.PRIVILEGES_QUERY = processed(PRIVILEGES_QUERY)
    this.TRIGGERS_QUERY = processed(TRIGGERS_QUERY)
  }

  static async create(connection: Queryable | string, props?: PostgreSQLOptions): Promise<PostgreSQL> {
    const c = typeof connection === 'string' ? createClient(connection) : connection
    const instance = new PostgreSQL(c, props)
    await instance.load_all_async()
    return instance
  }

  // deviation: pass the name of a query instead of the query itself - helps with type safety
  async execute<Name extends keyof Queries>(name: Name): Promise<Queries[Name]> {
    const query = this[name]
    let result = await this.c.any<Queries[Name][number]>(sql.raw(query))

    if (!result) {
      // deviation: don't know what c.fetchall() is supposed to do
      throw new Error(`Unexpected null result from query ${query}`)
      // return this.c.fetchall()
    }

    this.queryResults[name] = result

    return result
  }

  async load_all_async() {
    await this.load_schemas()
    await this.load_all_relations()
    await this.load_functions()
    this.selectables = {}
    Object.assign(this.selectables, this.relations)
    Object.assign(this.selectables, this.composite_types)
    Object.assign(this.selectables, this.functions)

    await this.load_privileges()
    await this.load_triggers()
    await this.load_collations()
    await this.load_rlspolicies()
    await this.load_types()
    await this.load_domains()

    await this.load_deps()
    await this.load_deps_all()
  }

  async load_schemas() {
    isa(this.SCHEMAS_QUERY, String)
    const q = await this.execute('SCHEMAS_QUERY')
    const schemas = q.map(each => new InspectedSchema({schema: asa(each.schema, String)}))
    this.schemas = Object.fromEntries(schemas.map(schema => [schema.schema, schema]))
  }

  async load_rlspolicies() {
    if (this.pg_version <= 9) {
      this.rlspolicies = {}
      return
    }

    const q = await this.execute('RLSPOLICIES_QUERY')

    const rlspolicies = q.map(
      p =>
        new InspectedRowPolicy({
          name: p.name,
          schema: p.schema,
          table_name: p.table_name,
          commandtype: p.commandtype,
          permissive: p.permissive,
          roles: p.roles,
          qual: p.qual,
          withcheck: p.withcheck,
        }),
    )

    this.rlspolicies = Object.fromEntries(rlspolicies.map(p => [p.key, p]))
  }

  async load_collations() {
    const q = await this.execute('COLLATIONS_QUERY')

    const collations = q.map(
      i =>
        new InspectedCollation({
          schema: i.schema,
          name: i.name,
          provider: i.provider,
          encoding: i.encoding,
          lc_collate: i.lc_collate,
          lc_ctype: i.lc_ctype,
          version: i.version,
        }),
    )

    this.collations = Object.fromEntries(collations.map(i => [i.quoted_full_name, i]))
  }

  async load_privileges() {
    const q = await this.execute('PRIVILEGES_QUERY')

    const privileges = q.map(
      i =>
        new InspectedPrivilege({
          object_type: i.object_type,
          schema: i.schema,
          name: i.name,
          privilege: i.privilege,
          target_user: i.user,
        }),
    )

    this.privileges = Object.fromEntries(privileges.map(i => [i.key, i]))
  }

  async load_deps() {
    const q = await this.execute('DEPS_QUERY')

    this.deps = [...q]

    for (const dep of this.deps) {
      const x = quoted_identifier(dep.name, dep.schema, dep.identity_arguments)
      const x_dependent_on = quoted_identifier(
        dep.name_dependent_on,
        dep.schema_dependent_on,
        dep.identity_arguments_dependent_on,
      )
      this.selectables[x].dependent_on.push(x_dependent_on)
      isa.array(this.selectables[x].dependent_on, String)
      this.selectables[x].dependent_on.sort()

      try {
        this.selectables[x_dependent_on].dependents.push(x)
        this.selectables[x_dependent_on].dependents.sort()
      } catch {
        // pass
      }

      for (const [k, t] of Object.entries(this.triggers)) {
        for (const dep_name of t.dependent_on) {
          const dependency = this.selectables[dep_name]
          dependency?.dependents.push(k)
        }
      }

      for (const [k, r] of Object.entries(this.relations)) {
        for (const [kc, c] of Object.entries(r.columns)) {
          if (c.is_enum) {
            const e_sig = c.enum.signature

            // eslint-disable-next-line max-depth
            if (e_sig in this.enums) {
              r.dependent_on.push(e_sig)
              c.enum.dependents.push(k)
            }
          }

          if (r.parent_table) {
            const pt = this.relations[r.parent_table]
            r.dependent_on.push(r.parent_table)
            pt.dependents.push(r.signature)
          }
        }
      }
    }
  }

  get_dependency_by_signature(signature: string) {
    const things = [this.selectables, this.enums, this.triggers]

    for (const thing of things) {
      if (signature in thing) {
        return thing[signature]
      }
    }
  }

  async load_deps_all() {
    const get_related_for_item = (
      item: InspectedSelectable | InspectedTrigger | InspectedEnum,
      att: 'dependent_on' | 'dependents',
    ): string[] => {
      const related = item[att].map((child: string) => this.get_dependency_by_signature(child))
      return [item.signature, ...related.flatMap(d => get_related_for_item(d, att))]
    }

    for (const [k, x] of Object.entries(this.selectables)) {
      let d_all = get_related_for_item(x, 'dependent_on').slice(1)
      d_all.sort()
      x.dependent_on_all = d_all
      d_all = get_related_for_item(x, 'dependents').slice(1)
      d_all.sort()
      x.dependents_all = d_all
    }
  }

  // todo: test this. not used by migra, so I don't know if it works. TopologicalSorter almost definitely has some problems
  dependency_order({
    drop_order = false,
    selectables = true,
    triggers = true,
    enums = true,
    include_fk_deps = false,
  } = {}): string[] {
    let graph: Record<string, string[]> = {}
    let things: Record<string, any> = {}

    if (enums) {
      things = {...things, ...this.enums}
    }

    if (selectables) {
      things = {...things, ...this.selectables}
    }

    if (triggers) {
      things = {...things, ...this.triggers}
    }

    for (const k in things) {
      const x = things[k]
      const dependent_on = [...x.dependent_on]

      if (k in this.tables && x.parent_table) {
        dependent_on.push(x.parent_table)
      }

      graph[k] = [...x.dependent_on]
    }

    if (include_fk_deps) {
      const fk_deps: Record<string, string[]> = {}

      for (const k in this.constraints) {
        const x = this.constraints[k]
        if (x.is_fk) {
          const t = x.quoted_full_table_name
          const other_t = x.quoted_full_foreign_table_name
          fk_deps[t] = [other_t]
        }
      }

      graph = {...graph, ...fk_deps}
    }

    const ts = new TopologicalSorter(graph)

    let ordering: string[] = []

    ts.prepare()

    while (ts.is_active()) {
      const items = ts.get_ready()

      const itemslist = [...items]

      ordering = ordering.concat(itemslist)
      ts.done(...items)
    }

    if (drop_order) {
      ordering.reverse()
    }

    return ordering
  }

  get partitioned_tables(): Map<string, any> {
    return new Map(Object.entries(this.tables).filter(([k, v]) => v.is_partitioned))
  }

  get alterable_tables(): Map<string, any> {
    return new Map(Object.entries(this.tables).filter(([k, v]) => v.is_alterable))
  }

  get data_tables(): Map<string, any> {
    return new Map(Object.entries(this.tables).filter(([k, v]) => v.contains_data))
  }

  get partitioning_child_tables(): Map<string, any> {
    return new Map(Object.entries(this.tables).filter(([k, v]) => v.is_partitioning_child_table))
  }

  get tables_using_partitioning(): Map<string, any> {
    return new Map(Object.entries(this.tables).filter(([k, v]) => v.uses_partitioning))
  }

  get tables_not_using_partitioning(): Map<string, any> {
    return new Map(Object.entries(this.tables).filter(([k, v]) => !v.uses_partitioning))
  }

  async load_all_relations() {
    this.tables = {}
    this.views = {}
    this.materialized_views = {}
    this.composite_types = {}

    let qEnums = await this.execute('ENUMS_QUERY')
    const enumlist = qEnums.map(i => {
      isa.array(i.elements, String)
      return new InspectedEnum({
        name: i.name,
        schema: i.schema,
        elements: i.elements,
        pg_version: this.pg_version,
      })
    })
    this.enums = Object.fromEntries(enumlist.map(i => [i.quoted_full_name, i]))
    const qRelations = await this.execute('ALL_RELATIONS_QUERY')

    for (const [_, g] of Object.entries(groupBy(qRelations, x => JSON.stringify([x.relationtype, x.schema, x.name])))) {
      const clist = Array.from(g)
      const f = clist[0]

      const get_enum = (name: string, schema: string) => {
        if (!name && !schema) {
          return null
        }

        const quoted_full_name = `${quoted_identifier(schema)}.${quoted_identifier(name)}`

        return this.enums[quoted_full_name]
      }

      const columns = clist
        .filter(c => c.position_number)
        .map(
          c =>
            new ColumnInfo({
              name: c.attname,
              dbtype: c.datatype,
              dbtypestr: c.datatypestring,
              pytype: this.to_pytype(c.datatype),
              default: c.defaultdef,
              not_null: c.not_null,
              is_enum: c.is_enum,
              enum: get_enum(c.enum_name, c.enum_schema),
              collation: c.collation,
              is_identity: c.is_identity,
              is_identity_always: c.is_identity_always,
              is_generated: c.is_generated,
              can_drop_generated: this.pg_version >= 13,
            }),
        )

      const s = new InspectedSelectable({
        name: f.name,
        schema: f.schema,
        columns: Object.fromEntries(columns.map(c => [c.name, c])),
        relationtype: f.relationtype,
        definition: f.definition,
        comment: f.comment,
        parent_table: f.parent_table,
        partition_def: f.partition_def,
        rowsecurity: f.rowsecurity,
        forcerowsecurity: f.forcerowsecurity,
        persistence: f.persistence,
      })

      // const RELATIONTYPES = {
      //   r: 'tables',
      //   v: 'views',
      //   m: 'materialized_views',
      //   c: 'composite_types',
      //   p: 'tables',
      // } as const
      // type RelationTypeProp = (typeof RELATIONTYPES)[keyof typeof RELATIONTYPES]

      // const att = this[
      //   RELATIONTYPES[f.relationtype]
      // ] as this[(typeof RELATIONTYPES)[keyof typeof RELATIONTYPES]] as InstanceType<typeof PostgreSQL>[RelationTypeProp]

      const relationDictsByType = {
        r: this.tables,
        v: this.views,
        m: this.materialized_views,
        c: this.composite_types,
        p: this.tables,
      }

      const att = relationDictsByType[f.relationtype as keyof typeof relationDictsByType]

      att[s.quoted_full_name] = s
    }

    for (const [k, t] of Object.entries(this.tables)) {
      if (t.is_inheritance_child_table) {
        const parent_table = this.tables[t.parent_table]
        for (const [cname, c] of Object.entries(t.columns)) {
          if (parent_table.columns[cname]) {
            c.is_inherited = true
          }
        }
      }
    }

    this.relations = {}
    for (const x of [this.tables, this.views, this.materialized_views]) {
      Object.assign(this.relations, x)
    }

    const qIndexes = await this.execute('INDEXES_QUERY')
    const indexlist = qIndexes.map(
      i =>
        new InspectedIndex({
          name: i.name,
          schema: i.schema,
          definition: i.definition,
          table_name: i.table_name,
          key_columns: i.key_columns,
          index_columns: i.index_columns,
          included_columns: i.included_columns,
          key_options: i.key_options,
          num_att: i.num_att,
          is_unique: i.is_unique,
          is_pk: i.is_pk,
          is_exclusion: i.is_exclusion,
          is_immediate: i.is_immediate,
          is_clustered: i.is_clustered,
          key_collations: i.key_collations,
          key_expressions: i.key_expressions,
          partial_predicate: i.partial_predicate,
          algorithm: i.algorithm,
        }),
    )

    this.indexes = Object.fromEntries(indexlist.map(i => [i.quoted_full_name, i]))

    const qSequences = await this.execute('SEQUENCES_QUERY')
    const sequencelist = qSequences.map(
      i =>
        new InspectedSequence({
          name: i.name,
          schema: i.schema,
          table_name: i.table_name,
          column_name: i.column_name,
        }),
    )

    this.sequences = Object.fromEntries(sequencelist.map(i => [i.quoted_full_name, i]))

    const qConstraints = await this.execute('CONSTRAINTS_QUERY')
    const constraintlist = []

    for (const i of qConstraints) {
      const constraint = new InspectedConstraint({
        name: i.name,
        schema: i.schema,
        constraint_type: i.constraint_type,
        table_name: i.table_name,
        definition: i.definition,
        index: i.index,
        is_fk: i.is_fk,
        is_deferrable: i.is_deferrable,
        initially_deferred: i.initially_deferred,
      })

      if (constraint.index) {
        const index_name = quoted_identifier(constraint.index, i.schema)
        const index = this.indexes[index_name]
        index.constraint = constraint
        // deviation: python does constraint.index = index, but that seems wrong to me
        constraint.index = index.name
      }

      if (constraint.is_fk) {
        isa(i.foreign_table_name, String)
        isa(i.foreign_table_schema, String)
        constraint.quoted_full_foreign_table_name = quoted_identifier(i.foreign_table_name, i.foreign_table_schema)
        constraint.fk_columns_foreign = i.fk_columns_foreign
        constraint.fk_columns_local = i.fk_columns_local
      }

      constraintlist.push(constraint)
    }

    this.constraints = Object.fromEntries(constraintlist.map(i => [i.quoted_full_name, i]))

    const qExtensions = await this.execute('EXTENSIONS_QUERY')
    const extensionlist = qExtensions.map(
      i =>
        new InspectedExtension({
          name: i.name,
          schema: i.schema,
          version: i.version,
        }),
    )

    this.extensions = Object.fromEntries(extensionlist.map(i => [i.name, i]))

    for (const each of Object.values(this.indexes)) {
      const t = each.quoted_full_table_name
      const n = each.quoted_full_name

      this.relations[t].indexes[n] = each
    }

    for (const each of Object.values(this.constraints)) {
      const t = each.quoted_full_table_name
      const n = each.quoted_full_name
      this.relations[t].constraints[n] = each
    }
  }

  get extensions_without_versions(): this['extensions'] {
    const result: Record<string, InspectedExtension> = {}
    for (const [k, v] of Object.entries(this.extensions)) {
      result[k] = v.unversioned_copy()
    }

    return result
  }

  async load_functions() {
    this.functions = {}
    const q = await this.execute('FUNCTIONS_QUERY')
    const grouped = groupBy(q, x => `${x.schema},${x.name},${x.identity_arguments}`)

    for (const [_, g] of Object.entries(grouped)) {
      const clist = g
      const f = clist[0]
      const outs = clist.filter(c => c.parameter_mode === 'OUT')
      let columns: ColumnInfo[]

      columns =
        outs.length > 0
          ? outs.map(
              c =>
                new ColumnInfo({
                  name: c.parameter_name,
                  dbtype: c.data_type,
                  pytype: this.to_pytype(c.data_type),
                }),
            )
          : [
              new ColumnInfo({
                name: f.name,
                dbtype: f.data_type,
                pytype: this.to_pytype(f.returntype),
                default: f.parameter_default,
              }),
            ]

      const plist = clist
        .filter(c => c.parameter_mode === 'IN')
        .map(
          c =>
            new ColumnInfo({
              name: c.parameter_name,
              dbtype: c.data_type,
              pytype: this.to_pytype(c.data_type),
              default: c.parameter_default,
            }),
        )

      const s = new InspectedFunction({
        schema: f.schema,
        name: f.name,
        columns: Object.fromEntries(columns.map(c => [c.name, c])),
        inputs: plist,
        identity_arguments: f.identity_arguments,
        result_string: f.result_string,
        language: f.language,
        definition: f.definition,
        strictness: f.strictness,
        security_type: f.security_type,
        volatility: f.volatility,
        full_definition: f.full_definition,
        comment: f.comment,
        returntype: f.returntype,
        kind: f.kind,
      })

      const identity_arguments = `(${s.identity_arguments})`
      this.functions[`${s.quoted_full_name}${identity_arguments}`] = s
    }
  }

  async load_triggers() {
    let q = await this.execute('TRIGGERS_QUERY')
    let triggers = q.map(
      i =>
        new InspectedTrigger({
          name: i.name,
          schema: i.schema,
          table_name: i.table_name,
          proc_schema: i.proc_schema,
          proc_name: i.proc_name,
          enabled: i.enabled,
          full_definition: i.full_definition,
        }),
    )

    this.triggers = Object.fromEntries(triggers.map(t => [t.signature, t]))
  }

  async load_types() {
    let q = await this.execute('TYPES_QUERY')

    let col = (defn: any) => {
      if (!defn?.attribute || !defn?.type) {
        throw new Error('Attribute or type missing', {cause: defn})
      }

      return [defn.attribute, defn.type]
    }

    let types = q.map(
      i =>
        new InspectedType({
          name: i.name,
          schema: i.schema,
          columns: Object.fromEntries((i.columns as string[]).map(col)),
        }),
    )
    this.types = Object.fromEntries(types.map(t => [t.signature, t]))
  }

  async load_domains() {
    let q = await this.execute('DOMAINS_QUERY')

    let domains = q.map(
      i =>
        new InspectedDomain({
          name: i.name,
          schema: i.schema,
          data_type: i.data_type,
          collation: i.collation,
          constraint_name: i.constraint_name,
          not_null: i.not_null,
          default: i.default,
          check: i.check,
        }),
    )

    this.domains = Object.fromEntries(domains.map(t => [t.signature, t]))
  }

  filter_schema(schema: string | null = null, exclude_schema: string | null = null): void {
    if (schema && exclude_schema) {
      throw new Error('Can only have schema or exclude_schema, not both')
    }

    let equal_to_schema = (x: any) => x.schema === schema
    let not_equal_to_exclude_schema = (x: any) => x.schema !== exclude_schema

    let comparator: (x: any) => boolean

    if (schema) {
      comparator = equal_to_schema
    } else if (exclude_schema) {
      comparator = not_equal_to_exclude_schema
    } else {
      throw new Error('schema or exclude_schema must not be none')
    }

    for (let prop of PROPS) {
      let att = this[prop]
      let filtered = Object.fromEntries(Object.entries(att).filter(([k, v]) => comparator(v)))
      this[prop] = filtered as any
    }
  }

  _as_dicts(): any {
    let done = new Set()

    let obj_to_d = (x: any, k: string | null = null): any => {
      if (done.has(x)) {
        if (typeof x === 'string' || typeof x === 'boolean' || typeof x === 'number') {
          return x
        }

        if ('quoted_full_name' in x)
          // if (x.hasOwnProperty('quoted_full_name')) {
          return x.quoted_full_name
        // }

        return '...'
      }

      done.add(x)

      if (x instanceof Object && !(x instanceof ColumnInfo) && !(x instanceof Inspected)) {
        let result: any = {}
        for (let key in x) {
          // if (x.hasOwnProperty(key)) {
          result[key] = obj_to_d(x[key], key)
          // }
        }

        return result
      }

      if (x instanceof ColumnInfo || x instanceof Inspected) {
        let safe_getattr = (x2: any, k2: string) => {
          try {
            return x2[k2]
          } catch {
            return 'NOT IMPLEMENTED'
          }
        }

        let result: any = {}
        for (let key of Object.keys(x)) {
          if (!key.startsWith('_') && typeof safe_getattr(x, key) !== 'function') {
            result[key] = obj_to_d(safe_getattr(x, key), key)
          }
        }

        return result
      }

      return x.toString()
    }

    let d: any = {}

    for (let prop of PROPS) {
      let att = this[prop]
      let _d: typeof att = {}
      for (let key in att) {
        // if (att.hasOwnProperty(key)) {
        _d[key] = obj_to_d(att[key])
        // }
      }

      d[prop] = _d
    }

    return d
  }

  encodeable_definition(): any {
    return this._as_dicts()
  }

  // as_yaml(): string {
  //   const s = yaml.safeDump(this.encodeable_definition())
  //   return s
  // }

  one_schema(schema: string): void {
    this.filter_schema(schema)
  }

  exclude_schema(schema: string): void {
    this.filter_schema(null, schema)
  }

  static serializationPropsClasses = {
    schemas: InspectedSchema,
    tables: InspectedSelectable,
    views: InspectedSelectable,
    materialized_views: InspectedSelectable,
    selectables: InspectedSelectable,
    relations: InspectedSelectable,
    sequences: InspectedSequence,
    enums: InspectedEnum,
    constraints: InspectedConstraint,
    extensions: InspectedExtension,
    functions: InspectedFunction,
    triggers: InspectedTrigger,
    collations: InspectedCollation,
    rlspolicies: InspectedRowPolicy,
  } satisfies Partial<Record<keyof PostgreSQL, any>>

  static serializationKeys = Object.keys(PostgreSQL.serializationPropsClasses) as Array<
    keyof typeof PostgreSQL.serializationPropsClasses
  >

  toJSON() {
    return pick(this, PostgreSQL.serializationKeys)
  }

  // deviation: this is new - idea being you can have use a serialized version served via API/S3/filesystem
  static fromJSON(json: any): PostgreSQL {
    const instance = new PostgreSQL(null as never)
    for (const prop of PostgreSQL.serializationKeys) {
      const Cls = PostgreSQL.serializationPropsClasses[prop]
      instance[prop] = Object.fromEntries(
        Object.entries<any>(json[prop] as {}).map(([k, v]) => {
          return [k, new Cls(v as never)]
        }),
      ) as any
    }
    return instance
  }

  // deviation: this is new - help making a baseline sql script for the whole database
  static empty(): PostgreSQL {
    return new PostgreSQL(null as never)
  }

  equals(other: PostgreSQL): boolean {
    return JSON.stringify(this) === JSON.stringify(other)
  }
}
