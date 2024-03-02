import {expect, test} from 'vitest'
import * as schemainspect from '../src'
import {AutoThisAssigner} from '../src/auto-this'
import {InspectedSelectable} from '../src/pg'

test('auto-this', () => {
  type ColumnParams = {table: string; name: string; type: string}
  class Column extends AutoThisAssigner<ColumnParams>() {
    constructor(public params: ColumnParams) {
      super(params)
    }

    get quotedName() {
      return `"${this.table}"."${this.name}"`
    }
  }

  const column = new Column({table: 'users', name: 'id', type: 'int'})

  expect(column.table).toBe('users')
  expect(column.name).toBe('id')
  expect(column.type).toBe('int')
  expect(column.quotedName).toBe('"users"."id"')
  expect(column.params).toEqual({table: 'users', name: 'id', type: 'int'})

  class Inspectable {
    constructor(public connection: string) {}

    connect() {
      return ['connecting to', this.connection]
    }
  }

  const InspectableColumnParent = AutoThisAssigner<ColumnParams, typeof Inspectable>(Inspectable)
  class InspectableColumn extends InspectableColumnParent {
    constructor(
      public params: ColumnParams,
      connection: string,
    ) {
      super(params, connection)
    }

    get quotedName() {
      this.connect()
      return `"${this.table}"."${this.name}"`
    }
  }

  const inspectableColumn = new InspectableColumn({table: 'users', name: 'id', type: 'int'}, 'localhost')

  expect(inspectableColumn.table).toBe('users')
  expect(inspectableColumn.name).toBe('id')
  expect(inspectableColumn.type).toBe('int')
  expect(inspectableColumn.quotedName).toBe('"users"."id"')
  expect(inspectableColumn.params).toEqual({table: 'users', name: 'id', type: 'int'})
  expect(inspectableColumn.connection).toBe('localhost')
  expect(inspectableColumn.connect()).toEqual(['connecting to', 'localhost'])
})

test('is a class', async () => {
  type ColumnParams = {table: string; name: string; type: string}
  class Column extends AutoThisAssigner<ColumnParams>() {
    constructor(public params: ColumnParams) {
      super(params)
    }

    get quotedName() {
      return `"${this.table}"."${this.name}"`
    }
  }

  expect(typeof Column).toBe('function')
  expect(typeof InspectedSelectable).toEqual('function')

  expect(typeof schemainspect.pg.InspectedSelectable).toBe('function')

  const c1 = new Column({table: 'users', name: 'id', type: 'int'})
  const c2 = new Column({table: 'users', name: 'id', type: 'int'})
  schemainspect.isa.record({c1, c2}, Column)
})
