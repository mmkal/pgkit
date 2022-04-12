import * as child_process from 'child_process'

import * as chokidar from 'chokidar'
import * as fsSyncer from 'fs-syncer'
import * as slonik from 'slonik'

import {SlonikTypegenCLI} from '../src/cli'
import {psqlCommand} from './helper'

beforeEach(() => {
  jest.clearAllMocks()
})

let pools: slonik.DatabasePool[] = []
jest.mock('slonik', () => {
  const actualSlonik = jest.requireActual('slonik')
  return {
    ...actualSlonik,
    createPool: (...args: any[]) => {
      const pool = actualSlonik.createPool(...args)
      pools.push(pool)
      return pool
    },
  }
})

jest.mock('child_process', () => ({
  ...jest.requireActual<any>('child_process'),
  execSync: jest.fn().mockImplementation(() => ''),
}))

jest.mock('chokidar', () => ({
  watch: jest.fn().mockReturnValue({
    on: jest.fn(),
    close: jest.fn(),
  }),
}))

afterAll(async () => {
  await Promise.all(pools.map(p => p.end()))
})

jest.spyOn(console, 'info').mockReset()
jest.spyOn(console, 'warn').mockReset()
jest.spyOn(console, 'error').mockReset()

test('runs typegen with sensible defaults', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default sql\`select 1 as a\`
      `,
    },
  })

  syncer.sync()

  await cli.executeWithoutErrorHandling(['generate', '--root-dir', syncer.baseDir, '--psql', psqlCommand])

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default sql\`select 1 as a\`
      "
  `)
}, 20000)

test('checks git status is clean', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jestFixture({
    targetState: {},
  })

  syncer.sync()

  await cli.executeWithoutErrorHandling(['generate', '--root-dir', syncer.baseDir])

  expect(child_process.execSync).toHaveBeenCalled()
  expect(child_process.execSync).toHaveBeenLastCalledWith('git diff --exit-code')
}, 20000)

test('can skip checking git status', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jestFixture({
    targetState: {},
  })

  syncer.sync()

  await cli.executeWithoutErrorHandling(['generate', '--root-dir', syncer.baseDir, '--skip-check-clean'])

  expect(child_process.execSync).not.toHaveBeenCalled()
}, 20000)

const fixPsqlCommand = (content: string) => content.split(psqlCommand).join('<<psql>>')

test('typegen.config.js is used by default', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jestFixture({
    targetState: {
      'typegen.config.js': `
        module.exports = {
          include: 'b*.ts',
          psqlCommand: ${JSON.stringify(psqlCommand)},
        }
      `,
      src: {
        'a.ts': `
          import {sql} from 'slonik'

          export default sql\`select 0 as a\`
        `,
        'b1.ts': `
          import {sql} from 'slonik'

          export default sql\`select 1 as a\`
        `,
        'b2.ts': `
          import {sql} from 'slonik'

          export default sql\`select 2 as a\`
        `,
      },
    },
  })

  jest.spyOn(process, 'cwd').mockReturnValue(syncer.baseDir)

  syncer.sync()

  await cli.executeWithoutErrorHandling(['generate'])

  expect(fixPsqlCommand(syncer.yaml())).toMatchInlineSnapshot(`
    "---
    typegen.config.js: |-
      module.exports = {
        include: 'b*.ts',
        psqlCommand: \\"<<psql>>\\",
      }
      
    src: 
      a.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 0 as a\`
        
      b1.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 1 as a\`
        
      b2.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 2 as a\`
        "
  `)
}, 20000)

test('config flag overrides typegen.config.js', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jestFixture({
    targetState: {
      'typegen.config.js': `
        module.exports = {
          include: 'b*.ts',
          psqlCommand: ${JSON.stringify(psqlCommand)},
        }
      `,
      // note that this config uses a default export to make sure that works too
      'otherconfig.js': `
        module.exports.default = {
          include: 'a.ts',
          psqlCommand: ${JSON.stringify(psqlCommand)},
        }
      `,
      src: {
        'a.ts': `
          import {sql} from 'slonik'

          export default sql\`select 0 as a\`
        `,
        'b1.ts': `
          import {sql} from 'slonik'

          export default sql\`select 1 as a\`
        `,
        'b2.ts': `
          import {sql} from 'slonik'

          export default sql\`select 2 as a\`
        `,
      },
    },
  })

  jest.spyOn(process, 'cwd').mockReturnValue(syncer.baseDir)

  syncer.sync()

  await cli.executeWithoutErrorHandling(['generate', '--config', 'otherconfig.js'])

  expect(fixPsqlCommand(syncer.yaml())).toMatchInlineSnapshot(`
    "---
    otherconfig.js: |-
      module.exports.default = {
        include: 'a.ts',
        psqlCommand: \\"<<psql>>\\",
      }
      
    typegen.config.js: |-
      module.exports = {
        include: 'b*.ts',
        psqlCommand: \\"<<psql>>\\",
      }
      
    src: 
      a.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 0 as a\`
        
      b1.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 1 as a\`
        
      b2.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 2 as a\`
        "
  `)
}, 20000)

test('use git to get changed files', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jestFixture({
    targetState: {},
  })

  syncer.sync()

  await cli.executeWithoutErrorHandling([
    'generate',
    '--root-dir',
    syncer.baseDir,
    '--skip-check-clean',
    '--since',
    'main',
    '--exclude',
    '**/node_modules/**',
    '--exclude',
    '**/second_exclude_pattern/**',
  ])

  expect(child_process.execSync).toHaveBeenCalledWith(`git diff --relative --name-only main`, {cwd: expect.any(String)})
}, 20000)

test('use chokidar to watch', async () => {
  // this only tests that we start using chokidar, watch.test.ts checks the actual functionality
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jestFixture({
    targetState: {},
  })

  syncer.sync()

  await cli.executeWithoutErrorHandling(['generate', '--root-dir', syncer.baseDir, '--skip-check-clean', '--watch'])

  expect(chokidar.watch).toHaveBeenCalledTimes(1)
  expect(chokidar.watch([]).on).toHaveBeenCalledTimes(2)
}, 20000)
