import {expect, test} from 'vitest'
import {InspectedSelectable, PostgreSQL} from '../src/pg'

function makeSelectable(name: string) {
  return new InspectedSelectable({
    name,
    schema: 'public',
    columns: {},
    definition: '',
    relationtype: 'v',
    comment: '',
  })
}

test('load_deps_all does not blow the stack on circular view dependencies', async () => {
  const db = PostgreSQL.empty()

  const a = makeSelectable('a')
  const b = makeSelectable('b')

  // Two views that depend on each other -- this can happen with e.g. matching pg_depend rows for
  // mutually-referencing views/rules, and previously caused infinite recursion in
  // get_related_for_item since it revisited the same signature forever.
  a.dependent_on.push(b.signature)
  b.dependents.push(a.signature)
  b.dependent_on.push(a.signature)
  a.dependents.push(b.signature)

  db.selectables[a.signature] = a
  db.selectables[b.signature] = b

  await expect(db.load_deps_all()).resolves.not.toThrow()

  expect(a.dependent_on_all).toEqual([b.signature])
  expect(b.dependent_on_all).toEqual([a.signature])
})
