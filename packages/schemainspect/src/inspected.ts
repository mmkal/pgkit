/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {AutoThisAssigner, SomeOptional, SomeRequired} from './auto-this'
import {AutoRepr, quoted_identifier, unquoted_identifier} from './misc'
import {InspectedConstraint, InspectedEnum, InspectedIndex} from './pg'
import {Relationtype} from './types'

export const pick = <T extends {}, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> => {
  return Object.fromEntries(keys.map(k => [k, obj[k]])) as Pick<T, K>
}

export abstract class Inspected extends AutoRepr {
  public name: string
  public schema: string

  abstract toJSON(): Record<string, unknown>

  abstract get drop_statement(): string
  abstract get create_statement(): string

  equals(other: Inspected): boolean {
    return JSON.stringify(this) === JSON.stringify(other)
  }

  get quoted_full_name() {
    return quoted_identifier(this.name, this.schema)
  }

  get signature() {
    return this.quoted_full_name
  }

  get unquoted_full_name() {
    return unquoted_identifier(this.name, this.schema)
  }

  get quoted_name() {
    return quoted_identifier(this.name)
  }

  get quoted_schema() {
    return quoted_identifier(this.schema)
  }

  // todo: __ne__
}

// export class TableRelated {
//   public schema: string
//   public table_name: string

//   constructor(schema: string, table_name: string) {
//     this.schema = schema
//     this.table_name = table_name
//   }

//   get quoted_full_name() {
//     return `${quoted_identifier(this.schema)}.${quoted_identifier(this.schema)}`
//   }
// }

export interface TableRelated {
  quoted_full_table_name: string
}

export const getQuotedFullTableName = (thing: {schema: string; table_name: string}) => {
  return `${quoted_identifier(thing.schema)}.${quoted_identifier(thing.table_name)}`
}

interface ColumnInfoOptions {
  name: string
  dbtype?: string
  dbtypestr?: string
  pytype?: string
  default?: string
  not_null?: boolean
  is_enum?: boolean
  enum?: InspectedEnum | null
  collation?: string
  is_identity?: boolean
  is_identity_always?: boolean
  is_generated?: boolean
  is_inherited?: boolean
  can_drop_generated?: boolean
}

export class ColumnInfo extends AutoThisAssigner<ColumnInfoOptions, typeof AutoRepr>(AutoRepr) {
  constructor(options: SomeRequired<Partial<ColumnInfoOptions>, 'name'>) {
    options.is_inherited ||= false
    super(options)
  }

  equals(other: ColumnInfo): boolean {
    return JSON.stringify(this) === JSON.stringify(other)
  }

  alter_clauses(other: ColumnInfo) {
    const clauses: string[] = []

    const notnull_changed = this.not_null !== other.not_null
    const notnull_added = notnull_changed && this.not_null
    const notnull_dropped = notnull_changed && !this.not_null

    const default_changed = this.default !== other.default

    const identity_changed =
      this.is_identity !== other.is_identity || this.is_identity_always !== other.is_identity_always

    const type_or_collation_changed = this.dbtypestr !== other.dbtypestr || this.collation !== other.collation

    if (default_changed) {
      clauses.push(this.alter_default_clause_or_generated(other))
    }

    if (notnull_added) {
      clauses.push(this.alter_not_null_clause)
    }

    if (identity_changed) {
      clauses.push(this.alter_identity_clause(other))
    }

    if (notnull_dropped) {
      clauses.push(this.alter_not_null_clause)
    }

    if (type_or_collation_changed) {
      if (this.is_enum && other.is_enum) {
        clauses.push(this.alter_enum_type_clause)
      } else {
        clauses.push(this.alter_data_type_clause)
      }
    }

    return clauses
  }

  change_enum_to_string_statement(table_name: string): string {
    if (this.is_enum) {
      return `alter table ${table_name} alter column ${this.quoted_name} set data type varchar using ${this.quoted_name}::varchar;`
    }

    throw new Error('ValueError')
  }

  change_string_to_enum_statement(table_name: string): string {
    if (this.is_enum) {
      return `alter table ${table_name} alter column ${this.quoted_name} set data type ${this.dbtypestr} using ${this.quoted_name}::${this.dbtypestr};`
    }

    throw new Error('ValueError')
  }

  change_enum_statement(table_name: string): string {
    if (this.is_enum) {
      return `alter table ${table_name} alter column ${this.name} type ${this.enum.quoted_full_name} using ${this.name}::text::${this.enum.quoted_full_name};`
    }

    throw new Error('ValueError')
  }

  drop_default_statement(table_name: string): string {
    return `alter table ${table_name} alter column ${this.quoted_name} drop default;`
  }

  add_default_statement(table_name: string): string {
    return `alter table ${table_name} alter column ${this.quoted_name} set default ${this.default};`
  }

  alter_table_statements(other: ColumnInfo, table_name: string): string[] {
    const prefix = `alter table ${table_name}`
    return this.alter_clauses(other).map(c => `${prefix} ${c};`)
  }

  get quoted_name(): string {
    return quoted_identifier(this.name)
  }

  get creation_clause(): string {
    let x = `${this.quoted_name} ${this.dbtypestr}`
    if (this.is_identity) {
      const identity_type = this.is_identity_always ? 'always' : 'by default'
      x += ` generated ${identity_type} as identity`
    }

    if (this.not_null) {
      x += ' not null'
    }

    if (this.is_generated) {
      x += ` generated always as (${this.default}) stored`
    } else if (this.default) {
      x += ` default ${this.default}`
    }

    return x
  }

  get add_column_clause(): string {
    return `add column ${this.creation_clause}${this.collation_subclause}`
  }

  get drop_column_clause(): string {
    return `drop column ${this.quoted_name}`
  }

  get alter_not_null_clause(): string {
    const keyword = this.not_null ? 'set' : 'drop'
    return `alter column ${this.quoted_name} ${keyword} not null`
  }

  get alter_default_clause(): string {
    const alter = this.default
      ? `alter column ${this.quoted_name} set default ${this.default}`
      : `alter column ${this.quoted_name} drop default`
    return alter
  }

  alter_default_clause_or_generated(other: ColumnInfo): string {
    let alter: string
    if (this.default) {
      alter = `alter column ${this.quoted_name} set default ${this.default}`
    } else if (other.is_generated && !this.is_generated) {
      alter = `alter column ${this.quoted_name} drop expression`
    } else {
      alter = `alter column ${this.quoted_name} drop default`
    }

    return alter
  }

  alter_identity_clause(other: ColumnInfo): string {
    let alter: string
    if (this.is_identity) {
      const identity_type = this.is_identity_always ? 'always' : 'by default'
      alter = other.is_identity
        ? `alter column ${this.quoted_name} set generated ${identity_type}`
        : `alter column ${this.quoted_name} add generated ${identity_type} as identity`
    } else {
      alter = `alter column ${this.quoted_name} drop identity`
    }

    return alter
  }

  get collation_subclause(): string {
    const collate = this.collation ? ` collate ${quoted_identifier(this.collation)}` : ''
    return collate
  }

  get alter_data_type_clause(): string {
    return `alter column ${this.quoted_name} set data type ${this.dbtypestr}${this.collation_subclause} using ${this.quoted_name}::${this.dbtypestr}`
  }

  get alter_enum_type_clause(): string {
    return `alter column ${this.quoted_name} set data type ${this.dbtypestr}${this.collation_subclause} using ${this.quoted_name}::text::${this.dbtypestr}`
  }
}

export type AllRelationTypes = Relationtype | 'f' | 'c'

export interface BaseInspectedSelectableOptions {
  name: string
  schema: string
  inputs: ColumnInfo[]
  columns: Record<string, ColumnInfo>
  definition: string
  relationtype: AllRelationTypes
  dependent_on: string[]
  dependents: string[]
  dependent_on_all: any[]
  dependents_all: string[]
  constraints: Record<string, InspectedConstraint>
  indexes: Record<string, InspectedIndex>
  comment: string
  parent_table?: string
  partition_def?: any
  rowsecurity?: boolean
  forcerowsecurity?: boolean
  persistence?: any
}

export abstract class BaseInspectedSelectable extends AutoThisAssigner<
  BaseInspectedSelectableOptions,
  typeof Inspected
>(Inspected) {
  static get _defaults() {
    return {
      inputs: [],
      ...({relationtype: 'unknown'} as {}),
      dependent_on: [],
      dependents: [],
      dependent_on_all: [],
      dependents_all: [],
      constraints: {},
      indexes: {},
    } satisfies Partial<BaseInspectedSelectableOptions>
  }

  constructor(options: SomeOptional<BaseInspectedSelectableOptions, keyof typeof BaseInspectedSelectable._defaults>) {
    super({...BaseInspectedSelectable._defaults, ...options})
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.persistence = options.persistence
  }

  toJSON() {
    return pick(this, [
      'relationtype',
      'name',
      'schema',
      'columns',
      'inputs',
      'definition',
      'parent_table',
      'partition_def',
      'rowsecurity',
      'persistence',
    ])
  }
}
