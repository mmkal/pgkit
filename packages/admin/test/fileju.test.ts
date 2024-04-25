import {test, expect} from 'vitest'
import {commonPrefix} from '@/client/views/parseFileTree'

test('commonPrefix', async () => {
  expect(
    commonPrefix([
      '/Users/mmkal/src/slonik-tools/packages/admin/zignoreme/migrator/migrations/2024.04.25T03.55.50.patients.sql',
      '/Users/mmkal/src/slonik-tools/packages/admin/zignoreme/migrator/migrations/down/2024.04.25T03.55.50.patients.sql',
    ]),
  ).toMatchInlineSnapshot(`"/Users/mmkal/src/slonik-tools/packages/admin/zignoreme/migrator/migrations/"`)
})
