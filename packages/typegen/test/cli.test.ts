import {SlonikTypegenCLI} from '../src/gdesc/cli'
import * as fsSyncer from 'fs-syncer'

afterEach(() => {
  jest.resetAllMocks()
})

test('runs typegen with sensible defaults', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jest.jestFixture({
    'index.ts': `
      import {sql} from 'slonik'

      export default sql\`select 1 as a\`
    `,
  })

  syncer.sync()

  await cli.execute(['generate', '--root-dir', syncer.baseDir])

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'
      
      export default sql<queries.A>\`select 1 as a\`
      
      module queries {
        /** - query: \`select 1 as a\` */
        export interface A {
          /** postgres type: \`integer\` */
          a: number | null
        }
      }
      "
  `)
}, 20000)

test('typegen.config.js is used by default', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jest.jestFixture({
    'typegen.config.js': `
      module.exports = {
        glob: 'b*.ts',
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
  })

  jest.spyOn(process, 'cwd').mockReturnValue(syncer.baseDir)

  syncer.sync()

  await cli.execute(['generate'])

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    typegen.config.js: |-
      module.exports = {
        glob: 'b*.ts',
      }
      
    src: 
      a.ts: |-
        import {sql} from 'slonik'
        
        export default sql\`select 0 as a\`
        
      b1.ts: |-
        import {sql} from 'slonik'
        
        export default sql<queries.A>\`select 1 as a\`
        
        module queries {
          /** - query: \`select 1 as a\` */
          export interface A {
            /** postgres type: \`integer\` */
            a: number | null
          }
        }
        
      b2.ts: |-
        import {sql} from 'slonik'
        
        export default sql<queries.A>\`select 2 as a\`
        
        module queries {
          /** - query: \`select 2 as a\` */
          export interface A {
            /** postgres type: \`integer\` */
            a: number | null
          }
        }
        "
  `)
}, 20000)

test('config flag overrides typegen.config.js', async () => {
  const cli = new SlonikTypegenCLI()

  const syncer = fsSyncer.jest.jestFixture({
    'typegen.config.js': `
      module.exports = {
        glob: 'b*.ts',
      }
    `,
    // note that this config uses a default export to make sure that works too
    'otherconfig.js': `
      module.exports.default = {
        glob: 'a.ts',
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
  })

  jest.spyOn(process, 'cwd').mockReturnValue(syncer.baseDir)

  syncer.sync()

  await cli.execute(['generate', '--config', 'otherconfig.js'])

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    otherconfig.js: |-
      module.exports.default = {
        glob: 'a.ts',
      }
      
    typegen.config.js: |-
      module.exports = {
        glob: 'b*.ts',
      }
      
    src: 
      a.ts: |-
        import {sql} from 'slonik'
        
        export default sql<queries.A>\`select 0 as a\`
        
        module queries {
          /** - query: \`select 0 as a\` */
          export interface A {
            /** postgres type: \`integer\` */
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
