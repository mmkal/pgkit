import {createPool} from '@pgkit/client'
import * as path from 'path'
import {beforeAll, expect, test} from 'vitest'
import {run as runMigra} from '../src/command'
import {format, getFixtures} from './fixtures'

export let admin: Awaited<ReturnType<typeof createPool>>

beforeAll(async () => {
  admin = createPool('postgresql://postgres:postgres@localhost:5432/postgres')
})

const originalFixturesDir = path.join(__dirname, 'FIXTURES')
const originalFixtures = getFixtures('python_parity', originalFixturesDir).map(f => [f] as const)

const newFixturesDir = path.join(__dirname, 'NEW_FIXTURES')
const newFixtures = getFixtures('new_features', newFixturesDir).map(f => [f] as const)

const assertPythonMigraAvailable = async () => {
  const {execa} = await import('execa')
  try {
    await execa('migra', ['--help'], {
      cwd: process.cwd(),
      env: process.env,
    })
  } catch (e) {
    const isENOENT = e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'
    if (isENOENT) {
      throw new Error(
        'Python migra CLI is not installed or not on PATH. Install it with:\n' +
          '  uv tool install migra==3.0.1663481299 --python 3.12 --with setuptools==80.7.1 --with psycopg2-binary==2.9.10\n' +
          '(requires uv: https://docs.astral.sh/uv)',
        {cause: e},
      )
    }
    throw e
  }
}

test('python migra CLI is installed and on PATH', async () => {
  await assertPythonMigraAvailable()
  const {execa} = await import('execa')
  const {stdout} = await execa('migra', ['--help'], {
    cwd: process.cwd(),
    env: process.env,
  })
  expect(stdout).toContain('usage: migra')
  expect(stdout).toContain('Generate a database migration.')
})

test.each(originalFixtures)(
  '%j python parity migra fixture',
  async ({name, args, ...fixture}) => {
    await assertPythonMigraAvailable()
    expect(name).toMatch(/^[\d_a-z]+$/)
    const [a, b] = await fixture.setup(admin)

    const {execa} = await import('execa')

    const expected = await execa('migra', [a, b, ...fixture.cliArgs()], {
      cwd: process.cwd(),
      env: process.env,
      reject: false, // migra exits with a non-zero code when there are changes
    }).then(p => format(p.stderr).trim() || format(p.stdout))
    const migra = await runMigra(a, b, args())
    const actual = format(migra.sql)

    expect(actual).toEqual(expected)
  },
  10_000,
)

test.each(newFixtures)(
  '%j new feature migra fixture',
  async ({name, args, ...fixture}) => {
    expect(name).toMatch(/^[\d_a-z]+$/)
    const [a, b] = await fixture.setup(admin)
    const expected = format(fixture.getExpected())
    const migra = await runMigra(a, b, args())
    const actual = format(migra.sql)

    expect(actual).toEqual(expected)
  },
  10_000,
)
