/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {Queryable, sql} from '@pgkit/client'
import {PostgreSQL, get_inspector} from '@pgkit/schemainspect'
import {Changes} from './changes'
import {Statements} from './statements'

export class Migration {
  statements: Statements
  changes: Changes
  schema: string | null
  exclude_schemas: string[] | null
  s_from: Queryable | PostgreSQL
  s_target: Queryable | PostgreSQL

  private constructor() {
    this.statements = new Statements()
  }

  static async create(
    x_from: Queryable | PostgreSQL,
    x_target: Queryable | PostgreSQL,
    {schema = null as string | null, exclude_schemas = null as string[] | null, ignore_extension_versions = false},
  ) {
    // deviation: python code checked if x_from and x_target were instances of DBInspector. This just insists on being passed valid SqlbagS instances
    const pg_from = await get_inspector(x_from, schema, exclude_schemas)
    const pg_target = await get_inspector(x_target, schema, exclude_schemas)
    const instance = new Migration()
    instance.changes = new Changes(pg_from, pg_target)
    instance.s_from = x_from
    instance.s_target = x_target

    instance.changes.ignore_extension_versions = ignore_extension_versions

    return instance
  }

  async inspect_from() {
    this.changes.i_from = await get_inspector(this.s_from, this.schema, this.exclude_schemas)
  }

  async inspect_target() {
    this.changes.i_target = await get_inspector(this.s_target, this.schema, this.exclude_schemas)
  }

  clear() {
    this.statements = new Statements()
  }

  async apply() {
    for (const stmt of this.statements) {
      const bag = this.s_from instanceof PostgreSQL ? this.s_from.c : this.s_from
      await bag.query(sql.raw(stmt))
    }

    this.changes.i_from = await get_inspector(this.s_from, this.schema, this.exclude_schema)
    const safety_on = this.statements.safe
    this.clear()
    this.set_safety(safety_on)
  }

  add(statements: Statements) {
    this.statements.add(statements)
  }

  add_sql(statement: string) {
    this.statements.add(new Statements(statement))
  }

  set_safety(safety_on: boolean) {
    this.statements.safe = safety_on
  }

  add_extension_changes({creates = true, drops = true} = {}) {
    if (creates) {
      this.add(this.changes.extensions({creations_only: true}))
    }

    if (drops) {
      this.add(this.changes.extensions({drops_only: true}))
    }
  }

  add_all_changes(privileges = false) {
    this.add(this.changes.schemas({creations_only: true}))

    this.add(this.changes.extensions({creations_only: true, modifications: false}))
    this.add(this.changes.extensions({modifications_only: true, modifications: true}))
    this.add(this.changes.collations({creations_only: true}))
    this.add(this.changes.enums({creations_only: true, modifications: false}))
    this.add(this.changes.sequences({creations_only: true}))
    this.add(this.changes.triggers({drops_only: true}))
    this.add(this.changes.rlspolicies({drops_only: true}))
    if (privileges) {
      this.add(this.changes.privileges({drops_only: true}))
    }

    this.add(this.changes.non_pk_constraints({drops_only: true}))

    this.add(this.changes.mv_indexes({drops_only: true}))
    this.add(this.changes.non_table_selectable_drops())

    this.add(this.changes.pk_constraints({drops_only: true}))
    this.add(this.changes.non_mv_indexes({drops_only: true}))

    this.add(this.changes.tables_only_selectables())

    this.add(this.changes.sequences({drops_only: true}))
    this.add(this.changes.enums({drops_only: true, modifications: false}))
    this.add(this.changes.extensions({drops_only: true, modifications: false}))
    this.add(this.changes.domains({drops_only: true}))

    this.add(this.changes.domains({creations_only: true}))
    this.add(this.changes.non_mv_indexes({creations_only: true}))
    this.add(this.changes.pk_constraints({creations_only: true}))
    this.add(this.changes.non_pk_constraints({creations_only: true}))

    this.add(this.changes.non_table_selectable_creations())
    this.add(this.changes.mv_indexes({creations_only: true}))

    if (privileges) {
      this.add(this.changes.privileges({creations_only: true}))
    }

    this.add(this.changes.rlspolicies({creations_only: true}))
    this.add(this.changes.triggers({creations_only: true}))
    this.add(this.changes.collations({drops_only: true}))
    this.add(this.changes.schemas({drops_only: true}))
  }

  get sql() {
    return this.statements.sql
  }
}
