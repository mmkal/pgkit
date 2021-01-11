import {SlonikTypegenCLI} from '../src/cli'
import * as fsSyncer from 'fs-syncer'
import * as slonik from 'slonik'
import {psqlCommand} from './helper'
import * as child_process from 'child_process'

afterEach(() => {
  jest.resetAllMocks()
})

let pools: slonik.DatabasePoolType[] = []
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
  execSync: jest.fn(),
}))

afterAll(async () => {
  await Promise.all(pools.map(p => p.end()))
})

jest.spyOn(console, 'info').mockReset()
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
      
      export default sql<queries.A>\`select 1 as a\`
      
      export module queries {
        /** - query: \`select 1 as a\` */
        export interface A {
          /** regtype: \`integer\` */
          a: number | null
        }
      }
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

test('typegen.config.js is used by default', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jestFixture({
    targetState: {
      'typegen.config.js': `
        module.exports = {
          glob: 'b*.ts',
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

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    typegen.config.js: |-
      module.exports = {
        glob: 'b*.ts',
        psqlCommand: \\"docker-compose exec -T postgres psql\\",
      }
      
    src: 
      a.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 0 as a\`
        
      b1.ts: |-
        import {sql} from 'slonik'
        
        export default sql<queries.A>\`select 1 as a\`
        
        export module queries {
          /** - query: \`select 1 as a\` */
          export interface A {
            /** regtype: \`integer\` */
            a: number | null
          }
        }
        
      b2.ts: |-
        import {sql} from 'slonik'
        
        export default sql<queries.A>\`select 2 as a\`
        
        export module queries {
          /** - query: \`select 2 as a\` */
          export interface A {
            /** regtype: \`integer\` */
            a: number | null
          }
        }
        "
  `)
}, 20000)

test('config flag overrides typegen.config.js', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jestFixture({
    targetState: {
      'typegen.config.js': `
        module.exports = {
          glob: 'b*.ts',
          psqlCommand: ${JSON.stringify(psqlCommand)},
        }
      `,
      // note that this config uses a default export to make sure that works too
      'otherconfig.js': `
        module.exports.default = {
          glob: 'a.ts',
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

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    otherconfig.js: |-
      module.exports.default = {
        glob: 'a.ts',
        psqlCommand: \\"docker-compose exec -T postgres psql\\",
      }
      
    typegen.config.js: |-
      module.exports = {
        glob: 'b*.ts',
        psqlCommand: \\"docker-compose exec -T postgres psql\\",
      }
      
    src: 
      a.ts: |-
        import {sql} from 'slonik'
        
        export default sql<queries.A>\`select 0 as a\`
        
        export module queries {
          /** - query: \`select 0 as a\` */
          export interface A {
            /** regtype: \`integer\` */
            a: number | null
          }
        }
        
      b1.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 1 as a\`
        
      b2.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 2 as a\`
        "
  `)
}, 20000)
