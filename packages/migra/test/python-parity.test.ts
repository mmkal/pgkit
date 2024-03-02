import {createPool} from '@pgkit/client'
import {beforeAll, expect, test} from 'vitest'
import {run as runMigra} from '../src/command'
import {getFixtures, format} from './fixtures'

export let admin: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  admin = createPool('postgresql://postgres:postgres@localhost:5432/postgres')
})

const fixtures = getFixtures('python_parity').map(f => [f] as const)

test.each(fixtures)('%j migra fixture', async ({name, args, ...fixture}) => {
  expect(name).toMatch(/^[\d_a-z]+$/)
  const [a, b] = await fixture.setup(admin)

  const {execa} = await import('execa')

  const expected = await execa('migra', [a, b, ...fixture.cliArgs()], {
    cwd: process.cwd(),
    env: process.env,
    reject: false, // migra exits with a non-zero code when there are changes
  }).then(p => format(p.stdout))
  const migra = await runMigra(a, b, args())
  const actual = format(migra.sql)

  expect(actual).toEqual(expected)
})
