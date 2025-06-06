import {createPool} from '@pgkit/client'
import {beforeAll, expect, test} from 'vitest'
import {run as runMigra} from '../src/command'
import {getFixtures, format} from './fixtures'

export let admin: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  admin = createPool('postgresql://postgres:postgres@localhost:5432/postgres')
})

const fixtures = getFixtures('python_parity').map(f => [f] as const)

test('python migra CLI is installed and on PATH', async () => {
  const {execa} = await import('execa')
  const {stdout} = await execa('migra', ['--help'], {
    cwd: process.cwd(),
    env: process.env,
  })
  expect(stdout).toContain('usage: migra')
  expect(stdout).toContain('Generate a database migration.')
})

test.each(fixtures)(
  '%j migra fixture',
  async ({name, args, ...fixture}) => {
    expect(name).toMatch(/^[\d_a-z]+$/)
    console.log(1001)
    const [a, b] = await fixture.setup(admin)
    console.log(1002)

    const {execa} = await import('execa')
    console.log(1003)

    const expected = await execa('migra', [a, b, ...fixture.cliArgs()], {
      cwd: process.cwd(),
      env: process.env,
      reject: false, // migra exits with a non-zero code when there are changes
    }).then(p => format(p.stderr).trim() || format(p.stdout))
    console.log(1004)
    const migra = await runMigra(a, b, args())
    console.log(1005)
    const actual = format(migra.sql)
    console.log(1006)

    expect(actual).toEqual(expected)
    console.log(1007)
  },
  10_000,
)
