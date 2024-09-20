/* eslint-disable mmkal/@typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
/* eslint-disable complexity */
/* eslint-disable max-depth */
import * as schemainspect from '@pgkit/schemainspect'
import {asa, isa, BaseInspectedSelectable, pg} from '@pgkit/schemainspect'
import {Statements} from './statements'
import {sortKeys, differences} from './util'

const {InspectedConstraint, InspectedEnum, InspectedExtension} = pg

const comparator =
  <T>(fn: (item: T) => boolean | number | string) =>
  (a: T, b: T) => {
    const [x, y] = [a, b].map(fn)
    if (typeof x === 'string' && typeof y === 'string') {
      return x.localeCompare(y)
    }

    return x < y ? -1 : x > y ? 1 : 0
  }

const THINGS = new Set([
  'schemas',
  'enums',
  'sequences',
  'constraints',
  'functions',
  'views',
  'indexes',
  'extensions',
  'privileges',
  'collations',
  'rlspolicies',
  'triggers',
  'domains',
])

const PK = 'PRIMARY KEY'

export type StatementsForChangesParams = Parameters<typeof statements_for_changes>[2]
function statements_for_changes(
  things_from: Record<string, schemainspect.Inspected>,
  things_target: Record<string, schemainspect.Inspected>,
  {
    creations_only = false,
    drops_only = false,
    modifications_only = false,
    modifications = true,
    dependency_ordering = false,
    add_dependents_for_modified = false,
    modifications_as_alters = false,
  },
) {
  const {added, removed, modified, unmodified} = differences(things_from, things_target)

  // isa.record(added, schemainspect.pg.InspectedSelectable)
  return statements_from_differences({
    added,
    removed,
    modified,
    // replaceable: undefined,
    creations_only,
    drops_only,
    modifications_only,
    modifications,
    dependency_ordering,
    old: things_from,
    modifications_as_alters,
  })
}

// eslint-disable-next-line complexity
function statements_from_differences(params: {
  added: Record<string, schemainspect.Inspected>
  removed: Record<string, schemainspect.Inspected>
  modified: Record<string, schemainspect.Inspected>
  replaceable?: Set<string>
  creations_only?: boolean
  drops_only?: boolean
  modifications?: boolean
  dependency_ordering?: boolean
  old?: Record<string, schemainspect.Inspected> | null
  modifications_only?: boolean
  modifications_as_alters?: boolean
}): Statements {
  let {
    added,
    removed,
    modified,
    replaceable = new Set(),
    creations_only = false,
    drops_only = false,
    modifications = true,
    dependency_ordering = false,
    old = null,
    modifications_only = false,
    modifications_as_alters = false,
  } = params

  isa(replaceable, Set)

  const statements = new Statements()

  let pending_creations = new Set<string>()
  let pending_drops = new Set<string>()

  const creations = !(drops_only || modifications_only)
  const drops = !(creations_only || modifications_only)
  modifications = modifications || (modifications_only && !(creations_only || drops_only))

  const drop_and_recreate = modifications && !modifications_as_alters
  const alters = modifications && modifications_as_alters

  if (drops) {
    pending_drops = new Set([...pending_drops, ...Object.keys(removed)])
  }

  if (creations) {
    isa.record(added, schemainspect.Inspected)
    pending_creations = new Set([...pending_creations, ...Object.keys(added)])
  }

  if (drop_and_recreate) {
    if (drops) {
      pending_drops = new Set([...pending_drops, ...new Set(Object.keys(modified).filter(x => !replaceable.has(x)))])
    }

    if (creations) {
      pending_creations = new Set([...pending_creations, ...Object.keys(modified)])
    }
  }

  if (alters) {
    for (const [k, v] of Object.entries(modified)) {
      isa(v, InspectedExtension)
      statements.add(v.alter_statements(asa(old[k], InspectedExtension)))
    }
  }

  function has_remaining_dependents(v: schemainspect.Inspected, _pending_drops: Set<string>) {
    if (!dependency_ordering) {
      return false
    }

    return v instanceof schemainspect.pg.InspectedSelectable && [...v.dependents].some(i => _pending_drops.has(i))
  }

  function has_uncreated_dependencies(v: schemainspect.Inspected, _pending_creations: Set<string>) {
    if (!dependency_ordering) {
      return false
    }

    return v instanceof schemainspect.pg.InspectedSelectable && [...v.dependent_on].some(i => _pending_creations.has(i))
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const before = new Set([...pending_drops, ...pending_creations])
    if (drops) {
      for (const [k, v] of Object.entries(removed)) {
        if (!has_remaining_dependents(v, pending_drops) && pending_drops.has(k)) {
          statements.append(old[k].drop_statement)
          pending_drops.delete(k)
        }
      }
    }

    if (creations) {
      for (const [k, v] of Object.entries(added)) {
        isa(v, schemainspect.Inspected)
        if (!has_uncreated_dependencies(v, pending_creations) && pending_creations.has(k)) {
          // deviation: instanceof check not in python, it just relies on duck typing
          if (v instanceof InspectedConstraint && v.safer_create_statements) {
            statements.add(v.safer_create_statements)
          } else {
            statements.append(v.create_statement)
          }

          pending_creations.delete(k)
        }
      }
    }

    if (modifications) {
      for (const [k, v] of Object.entries(modified)) {
        // isa(v, schemainspect.pg.InspectedSelectable)
        if (drops && !has_remaining_dependents(v, pending_drops) && pending_drops.has(k)) {
          statements.append(old[k].drop_statement)
          pending_drops.delete(k)
        }

        if (creations && !has_uncreated_dependencies(v, pending_creations) && pending_creations.has(k)) {
          // deviation: instanceof check not in python, it just relies on duck typing
          if (v instanceof InspectedConstraint && v.safer_create_statements) {
            statements.add(v.safer_create_statements)
          } else {
            statements.append(v.create_statement)
          }

          pending_creations.delete(k)
        }
      }
    }

    const after = new Set([...pending_drops, ...pending_creations])
    if (after.size === 0) {
      break
    } else if (after.size === before.size) {
      throw new Error('cannot resolve dependencies')
    }
  }

  return statements
}

function get_enum_modifications(
  {tables_from, tables_target, enums_from, enums_target}: ChangeParams<'tables' | 'enums'>,
  {return_tuple = false},
) {
  const {modified: e_modified} = differences(enums_from, enums_target)
  const {modified: t_modified} = differences(tables_from, tables_target)
  const pre = new Statements()
  const recreate = new Statements()
  const post = new Statements()
  const enums_to_change = e_modified

  for (const [t, v] of Object.entries(t_modified)) {
    isa(v, BaseInspectedSelectable)
    const t_before = tables_from[t]
    const {modified: c_modified} = differences(t_before.columns, v.columns)
    for (const [k, c] of Object.entries(c_modified)) {
      isa(c, schemainspect.ColumnInfo)
      const before = t_before.columns[k]
      isa(before, schemainspect.ColumnInfo)

      if (c.is_enum && before.is_enum && c.dbtypestr === before.dbtypestr && c.enum !== before.enum) {
        const has_default = c.default && !c.is_generated

        if (has_default) {
          pre.append(before.drop_default_statement(t))
        }

        const recast = c.change_enum_statement(v.quoted_full_name)

        recreate.append(recast)

        if (has_default) {
          post.append(before.add_default_statement(t))
        }
      }
    }
  }

  const unwanted_suffix = '__old_version_to_be_dropped'

  for (const e of Object.values(enums_to_change)) {
    isa(e, InspectedEnum)
    const unwanted_name = e.name + unwanted_suffix

    const rename = e.alter_rename_statement(unwanted_name)
    pre.append(rename)

    pre.append(e.create_statement)

    const drop_statement = e.drop_statement_with_rename(unwanted_name)

    post.append(drop_statement)
  }

  if (return_tuple) {
    return [pre, recreate.concat(post)] as const
  }

  throw new Error(`NotImplementedError: returnn_tuple=${return_tuple}`)
  // return pre.concat(recreate).concat(post)
}

function get_table_changes({
  tables_from,
  tables_target,
  enums_from,
  enums_target,
  sequences_from,
  sequences_target,
}: ChangeParams<'tables' | 'enums' | 'sequences'>) {
  isa.record(tables_from, schemainspect.pg.InspectedSelectable)
  isa.record(tables_target, schemainspect.pg.InspectedSelectable)
  const {added, removed, modified} = differences(tables_from, tables_target)

  let statements = new Statements()
  for (const [t, v] of Object.entries(removed)) {
    statements.append(v.drop_statement)
  }

  const [enums_pre, enums_post] = get_enum_modifications(
    {tables_from, tables_target, enums_from, enums_target},
    {return_tuple: true},
  )

  statements = statements.concat(enums_pre)

  for (const [t, v] of Object.entries(added)) {
    isa(v, schemainspect.pg.InspectedSelectable)
    statements.append(v.create_statement)
    if (v.rowsecurity) {
      const rls_alter = v.alter_rls_statement
      statements.append(rls_alter)
    }
  }

  statements = statements.concat(enums_post)

  for (const [t, v] of Object.entries(modified)) {
    isa(v, schemainspect.pg.InspectedSelectable)
    const before = tables_from[t]

    if (v.is_partitioned !== before.is_partitioned) {
      statements.append(v.drop_statement)
      statements.append(v.create_statement)
      continue
    }

    if (v.is_unlogged !== before.is_unlogged) {
      statements = statements.concat(new Statements(v.alter_unlogged_statement))
    }

    if (v.parent_table !== before.parent_table) {
      statements = statements.concat(v.attach_detach_statements(before))
    }
  }

  const modified_order = Object.keys(modified)

  modified_order.sort(comparator((k: string) => modified[k].is_inheritance_child_table))

  for (const t of modified_order) {
    const v = modified[t]
    isa(v, schemainspect.pg.InspectedSelectable)

    const before = tables_from[t]

    if (!v.is_alterable) {
      continue
    }

    // const [c_added, c_removed, c_modified, _] = differences(before.columns, v.columns)
    const {added: c_added, removed: c_removed, modified: c_modified} = differences(before.columns, v.columns)

    for (const k of Object.keys(c_modified)) {
      const c = v.columns[k]
      const c_before = before.columns[k]

      const generated_status_changed = c.is_generated !== c_before.is_generated

      const inheritance_status_changed = c.is_inherited !== c_before.is_inherited

      const generated_status_removed = !c.is_generated && c_before.is_generated

      const can_drop_generated = generated_status_removed && c_before.can_drop_generated

      const drop_and_recreate_required = inheritance_status_changed || (generated_status_changed && !can_drop_generated)

      if (drop_and_recreate_required) {
        // eslint-disable-next-line mmkal/@typescript-eslint/no-dynamic-delete
        delete c_modified[k]

        if (!c_before.is_inherited) {
          c_removed[k] = c_before
        }

        if (!c.is_inherited) {
          c_added[k] = c
        }
      }

      if (generated_status_changed) {
        // pass
      }
    }

    for (const [k, c] of Object.entries(c_removed)) {
      const alter = v.alter_table_statement(c.drop_column_clause)
      statements.append(alter)
    }

    for (const [k, c] of Object.entries(c_added)) {
      const alter = v.alter_table_statement(c.add_column_clause)
      statements.append(alter)
    }

    for (const [k, c] of Object.entries(c_modified)) {
      const c_before = before.columns[k]
      statements = statements.concat(c.alter_table_statements(c_before, t))
    }

    if (v.rowsecurity !== before.rowsecurity) {
      const rls_alter = v.alter_rls_statement
      statements.append(rls_alter)
    }
  }

  // const [seq_created, seq_dropped, seq_modified, _] = differences(sequences_from, sequences_target)
  isa.record(sequences_from, schemainspect.pg.InspectedSequence)
  isa.record(sequences_target, schemainspect.pg.InspectedSequence)
  const {
    added: seq_created,
    removed: seq_dropped,
    modified: seq_modified,
  } = differences(sequences_from, sequences_target)

  for (const k of Object.keys(seq_created)) {
    const seq_b = sequences_target[k]

    if (seq_b.quoted_table_and_column_name) {
      statements.append(seq_b.alter_ownership_statement)
    }
  }

  for (const k of Object.keys(seq_modified)) {
    const seq_a = sequences_from[k]
    const seq_b = sequences_target[k]

    if (seq_a.quoted_table_and_column_name !== seq_b.quoted_table_and_column_name) {
      statements.append(seq_b.alter_ownership_statement)
    }
  }

  return statements
}

function get_selectable_differences({
  selectables_from,
  selectables_target,
  enums_from,
  enums_target,
  add_dependents_for_modified,
}: {
  selectables_from: Record<string, schemainspect.pg.InspectedSelectable>
  selectables_target: Record<string, schemainspect.pg.InspectedSelectable>
  enums_from: Record<string, schemainspect.pg.InspectedEnum>
  enums_target: Record<string, schemainspect.pg.InspectedEnum>
  add_dependents_for_modified: boolean
}) {
  isa.record(selectables_from, schemainspect.pg.InspectedSelectable)
  isa.record(selectables_target, schemainspect.pg.InspectedSelectable)
  const tables_from = Object.fromEntries(Object.entries(selectables_from).filter(([k, v]) => v.is_table))
  const tables_target = Object.fromEntries(Object.entries(selectables_target).filter(([k, v]) => v.is_table))

  const other_from = Object.fromEntries(Object.entries(selectables_from).filter(([k, v]) => !v.is_table))
  const other_target = Object.fromEntries(Object.entries(selectables_target).filter(([k, v]) => !v.is_table))

  const {
    added: added_tables,
    removed: removed_tables,
    modified: modified_tables,
    unmodified: unmodified_tables,
  } = differences(tables_from, tables_target)
  let [added_other, removed_other, modified_other, unmodified_other] = differences(other_from, other_target).array

  const {modified: modified_enums} = differences(enums_from, enums_target)

  const changed_all = {...modified_tables, ...modified_other}
  const modified_all = {...changed_all}
  Object.assign(changed_all, removed_tables, removed_other)

  const replaceable = new Set<string>()
  const not_replaceable = new Set<string>()

  if (add_dependents_for_modified) {
    for (const [k, m] of Object.entries(changed_all)) {
      isa(m, schemainspect.pg.InspectedSelectable)
      const old = selectables_from[k]

      if (k in modified_all && asa(m, schemainspect.pg.InspectedSelectable).can_replace(old)) {
        if (!m.is_table) {
          const changed_enums = m.dependent_on.filter(_ => _ in modified_enums)
          if (changed_enums.length === 0) {
            replaceable.add(k)
          }
        }

        continue
      }

      for (const d of m.dependents_all) {
        if (d in unmodified_other) {
          const dd = unmodified_other[d]
          // eslint-disable-next-line mmkal/@typescript-eslint/no-dynamic-delete
          delete unmodified_other[d]
          modified_other[d] = dd
        }

        not_replaceable.add(d)
      }
    }

    modified_other = sortKeys(modified_other)
  }

  for (const item of not_replaceable) {
    replaceable.delete(item)
  }

  return {
    tables_from,
    tables_target,
    added_tables,
    removed_tables,
    modified_tables,
    added_other,
    removed_other,
    modified_other,
    replaceable,
  }
}

function get_trigger_changes(
  {
    triggers_from,
    triggers_target,
    selectables_from,
    selectables_target,
    enums_from,
    enums_target,
  }: ChangeParams<'triggers' | 'selectables' | 'enums'>,
  {
    add_dependents_for_modified = true,
    ...kwargs
  }: {add_dependents_for_modified?: boolean} & Omit<
    Parameters<typeof statements_from_differences>[0],
    'added' | 'removed' | 'modified' | 'old'
  > = {},
) {
  isa.record(triggers_from, schemainspect.pg.InspectedTrigger)
  isa.record(triggers_target, schemainspect.pg.InspectedTrigger)
  const {modified_tables, modified_other, replaceable} = get_selectable_differences({
    selectables_from,
    selectables_target,
    enums_from,
    enums_target,
    add_dependents_for_modified,
  })

  const {added, removed, modified, unmodified} = differences(triggers_from, triggers_target)

  const modified_tables_and_other = new Set(Object.keys(modified_other))
  const deps_modified = Object.entries(unmodified)
    .filter(([k, v]) => {
      isa(v, schemainspect.pg.InspectedTrigger)
      return (
        modified_tables_and_other.has(v.quoted_full_selectable_name) && !replaceable.has(v.quoted_full_selectable_name)
      )
    })
    .map(([k, v]) => k)

  for (const k of deps_modified) {
    modified[k] = unmodified[k]
    // eslint-disable-next-line mmkal/@typescript-eslint/no-dynamic-delete
    delete unmodified[k]
  }

  isa.record(triggers_from, schemainspect.pg.InspectedTrigger)

  return statements_from_differences({
    added,
    removed,
    modified,
    old: triggers_from,
    ...kwargs,
  })
}

function get_selectable_changes(
  {
    selectables_from,
    selectables_target,
    enums_from,
    enums_target,
    sequences_from,
    sequences_target,
  }: ChangeParams<'selectables' | 'enums' | 'sequences'>,
  {
    add_dependents_for_modified = true,
    tables_only = false,
    non_tables_only = false,
    drops_only = false,
    creations_only = false,
  } = {},
) {
  isa.record(selectables_from, schemainspect.pg.InspectedSelectable)
  isa.record(selectables_target, schemainspect.pg.InspectedSelectable)
  const {tables_from, tables_target, added_other, removed_other, modified_other, replaceable} =
    get_selectable_differences({
      selectables_from,
      selectables_target,
      enums_from,
      enums_target,
      add_dependents_for_modified,
    })

  let statements = new Statements()

  function functions(d: Record<string, schemainspect.pg.InspectedSelectable>) {
    return Object.fromEntries(
      Object.entries(d).filter(([k, v]) => {
        isa(v, schemainspect.pg.InspectedSelectable)
        return v.relationtype === 'f'
      }),
    )
  }

  if (!tables_only && !creations_only) {
    statements = statements.concat(
      statements_from_differences({
        added: added_other,
        removed: removed_other,
        modified: modified_other,
        replaceable,
        drops_only: true,
        dependency_ordering: true,
        old: selectables_from,
      }),
    )
  }

  if (!non_tables_only) {
    statements = statements.concat(
      get_table_changes({
        tables_from,
        tables_target,
        enums_from,
        enums_target,
        sequences_from,
        sequences_target,
      }),
    )
  }

  if (!tables_only && !drops_only) {
    if (Object.keys(functions(added_other)).length > 0 || Object.keys(functions(modified_other)).length > 0) {
      statements.push('set check_function_bodies = off;')
    }

    statements = statements.concat(
      statements_from_differences({
        added: added_other,
        removed: removed_other,
        modified: modified_other,
        replaceable,
        creations_only: true,
        dependency_ordering: true,
        old: selectables_from,
      }),
    )
  }

  return statements
}

export class Changes {
  i_from: schemainspect.PostgreSQL
  i_target: schemainspect.PostgreSQL
  ignore_extension_versions: boolean

  constructor(i_from: schemainspect.PostgreSQL, i_target: schemainspect.PostgreSQL, ignore_extension_versions = false) {
    this.i_from = i_from
    this.i_target = i_target
    this.ignore_extension_versions = ignore_extension_versions
  }

  get extensions() {
    if (this.ignore_extension_versions) {
      const fe = this.i_from.extensions_without_versions
      const te = this.i_target.extensions_without_versions

      return (params?: StatementsForChangesParams) => statements_for_changes(fe, te, params || {})
    }

    return (params?: StatementsForChangesParams) =>
      statements_for_changes(this.i_from.extensions, this.i_target.extensions, {
        modifications_as_alters: true,
        ...params,
      })
  }

  get selectables() {
    return (params?: GetSelectableChangesOptions) =>
      get_selectable_changes(
        {
          selectables_from: sortKeys(this.i_from.selectables),
          selectables_target: sortKeys(this.i_target.selectables),
          enums_from: this.i_from.enums,
          enums_target: this.i_target.enums,
          sequences_from: this.i_from.sequences,
          sequences_target: this.i_target.sequences,
        },
        params,
      )
  }

  get tables_only_selectables() {
    return (params?: GetSelectableChangesOptions) => {
      return get_selectable_changes(
        {
          selectables_from: sortKeys(this.i_from.selectables),
          selectables_target: sortKeys(this.i_target.selectables),
          enums_from: this.i_from.enums,
          enums_target: this.i_target.enums,
          sequences_from: this.i_from.sequences,
          sequences_target: this.i_target.sequences,
        },
        {tables_only: true, ...params},
      )
    }
  }

  get non_table_selectable_drops() {
    return (params?: GetSelectableChangesOptions) =>
      get_selectable_changes(
        {
          selectables_from: sortKeys(this.i_from.selectables),
          selectables_target: sortKeys(this.i_target.selectables),
          enums_from: this.i_from.enums,
          enums_target: this.i_target.enums,
          sequences_from: this.i_from.sequences,
          sequences_target: this.i_target.sequences,
        },
        {
          drops_only: true,
          non_tables_only: true,
          ...params,
        },
      )
  }

  get non_table_selectable_creations() {
    return (params?: GetSelectableChangesOptions) =>
      get_selectable_changes(
        {
          selectables_from: sortKeys(this.i_from.selectables),
          selectables_target: sortKeys(this.i_target.selectables),
          enums_from: this.i_from.enums,
          enums_target: this.i_target.enums,
          sequences_from: this.i_from.sequences,
          sequences_target: this.i_target.sequences,
        },
        {
          creations_only: true,
          non_tables_only: true,
          ...params,
        },
      )
  }

  get non_pk_constraints() {
    const a = Object.entries(this.i_from.constraints)
    const b = Object.entries(this.i_target.constraints)
    const a_od = Object.fromEntries(a.filter(([k, v]) => asa(v, InspectedConstraint).constraint_type !== PK))
    const b_od = Object.fromEntries(b.filter(([k, v]) => asa(v, InspectedConstraint).constraint_type !== PK))
    return (params?: Parameters<typeof statements_for_changes>[2]) => statements_for_changes(a_od, b_od, params)
  }

  get pk_constraints() {
    const a = Object.entries(this.i_from.constraints)
    const b = Object.entries(this.i_target.constraints)
    const a_od = Object.fromEntries(a.filter(([k, v]) => asa(v, InspectedConstraint).constraint_type === PK))
    const b_od = Object.fromEntries(b.filter(([k, v]) => asa(v, InspectedConstraint).constraint_type === PK))
    return (params?: Parameters<typeof statements_for_changes>[2]) => statements_for_changes(a_od, b_od, params)
  }

  get triggers() {
    return (params?: Parameters<typeof get_trigger_changes>[1]) =>
      get_trigger_changes(
        {
          triggers_from: sortKeys(this.i_from.triggers),
          triggers_target: sortKeys(this.i_target.triggers),
          selectables_from: sortKeys(this.i_from.selectables),
          selectables_target: sortKeys(this.i_target.selectables),
          enums_from: this.i_from.enums,
          enums_target: this.i_target.enums,
        },
        params,
      )
  }

  get mv_indexes() {
    const a = Object.entries(this.i_from.indexes)
    const b = Object.entries(this.i_target.indexes)

    function is_mv_index(i: schemainspect.pg.InspectedIndex, ii: schemainspect.PostgreSQL) {
      const sig = schemainspect.misc.quoted_identifier(i.table_name, i.schema)
      return sig in ii.materialized_views
    }

    const a_od = Object.fromEntries(a.filter(([k, v]) => is_mv_index(v, this.i_from)))
    const b_od = Object.fromEntries(b.filter(([k, v]) => is_mv_index(v, this.i_target)))
    return (params?: Parameters<typeof statements_for_changes>[2]) => statements_for_changes(a_od, b_od, params)
  }

  get non_mv_indexes() {
    const a = Object.entries(this.i_from.indexes)
    const b = Object.entries(this.i_target.indexes)

    function is_mv_index(i: schemainspect.pg.InspectedIndex, ii: schemainspect.PostgreSQL) {
      const sig = schemainspect.misc.quoted_identifier(i.table_name, i.schema)
      return sig in ii.materialized_views
    }

    const a_od = Object.fromEntries(a.filter(([k, v]) => !is_mv_index(v, this.i_from)))
    const b_od = Object.fromEntries(b.filter(([k, v]) => !is_mv_index(v, this.i_target)))
    return (params?: Parameters<typeof statements_for_changes>[2]) => statements_for_changes(a_od, b_od, params)
  }

  get sequences() {
    return (params?: Parameters<typeof statements_for_changes>[2]) =>
      statements_for_changes(this.i_from.sequences, this.i_target.sequences, {
        modifications: false,
        ...params,
      })
  }

  // TypeScript does not support dynamic property access in the same way as Python.
  // You would need to implement a method that takes the name as a parameter and returns the appropriate function.
  getChangesFor = <P extends PGDictProp>(name: P) => {
    if (!THINGS.has(name)) throw new Error(`AttributeError: ${name}. Changes can be for: ${[...THINGS].join(',')}`)

    return (opts?: StatementsForChangesParams) => statements_for_changes(this.i_from[name], this.i_target[name], opts)
  }

  schemas = this.getChangesFor('schemas')
  collations = this.getChangesFor('collations')
  enums = this.getChangesFor('enums')
  rlspolicies = this.getChangesFor('rlspolicies')
  privileges = this.getChangesFor('privileges')
  domains = this.getChangesFor('domains')
}

export type GetSelectableChangesOptions = Parameters<typeof get_selectable_changes>[1]

export type PGDictProp = {
  [K in keyof schemainspect.PostgreSQL]: schemainspect.PostgreSQL[K] extends Record<string, schemainspect.Inspected>
    ? schemainspect.PostgreSQL[K] extends {ifItExtendsThisItMustBeAny: true}
      ? never
      : K
    : never
}[keyof schemainspect.PostgreSQL]

export type ChangeParams<P extends PGDictProp> = {
  [K in P as `${K}_${'from' | 'target'}`]: schemainspect.PostgreSQL[K]
}
