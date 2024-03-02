import {SqlbagS} from './sqlbag'

export type SqlaDialect = {
  ischema_names: Record<string, () => {python_type: string}>
}

export const to_pytype = (sqla_dialect: SqlaDialect, typename: string) => {
  const sqla_obj = sqla_dialect.ischema_names[typename]()
  return sqla_obj?.python_type
}

export abstract class DBInspector {
  engine: unknown
  dialect: SqlaDialect
  include_internal: boolean
  c: SqlbagS
  constructor(
    c: SqlbagS,
    {include_internal = false}: {include_internal?: boolean; i_remembered_to_call_initialize_super: true},
  ) {
    this.c = c
    // deviation: don't bother with engine/dialect
    // this.engine = c.engine
    // this.dialect = c.dialect || 'postgresql'
    this.include_internal = include_internal
    // deviation: subclasses are responsible for initializing themselves
    // this.load_all()
  }

  // /** Subclasses need to call this when they're ready. Python lets you call `super(...)` at the end of a constructor but js doesn't */
  // initialize_super() {
  //   this.load_all()
  // }

  abstract load_all_async(): Promise<void>

  to_pytype(typename: string) {
    return this.engine ? to_pytype(this.dialect, typename) : null
  }
}

export class NullInspector extends DBInspector {
  constructor() {
    super(null, {i_remembered_to_call_initialize_super: true})
  }

  async load_all_async() {}
}
