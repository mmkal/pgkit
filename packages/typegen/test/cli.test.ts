import {main} from '../src'
import {resolve, join} from 'path'
const fs = require('fs')

jest.mock('fs', () => {
  const mockableFunctions: Array<keyof typeof import('fs')> = ['writeFileSync', 'mkdirSync', 'unlinkSync', 'rmdirSync']
  const realFs = require.requireActual('fs')
  const mockFunctions = {} as any
  const mockedFsModule = {...realFs, mocks: mockFunctions}
  mockableFunctions.forEach(name => {
    mockFunctions[name] = jest.fn()
    mockedFsModule[name] = (...args: any[]) => {
      const writer = args[0].replace(/\\/g, '/').includes('test/generated') ? mockFunctions[name] : realFs[name]
      return writer(...args)
    }
  })
  return mockedFsModule
})

jest.spyOn(console, 'log').mockImplementation(() => {})

expect.addSnapshotSerializer({
  test: jest.isMockFunction,
  print: v =>
    JSON.stringify(v.mock.calls, null, 2)
      .replace(/(\\r)?\\n/g, '__EOL__')
      .replace(/\\+/g, '/') // fix Windows backslashes :'(
      .replace(/__EOL__/g, '\\n')
      .split(process.cwd().replace(/\\+/g, '/'))
      .join('[cwd]'),
})

describe('cli reset', () => {
  beforeEach(jest.clearAllMocks)

  it(`recursively creates directory when one doesn't exist`, () => {
    main(['test/generated/foo/bar/baz/this/path/does/not/exist'])
    expect(fs.mocks).toMatchInlineSnapshot(`
            Object {
              "mkdirSync": [
              [
                "test/generated/foo/bar/baz/this/path/does/not/exist",
                {
                  "recursive": true
                }
              ]
            ],
              "rmdirSync": [],
              "unlinkSync": [],
              "writeFileSync": [
              [
                "test/generated/foo/bar/baz/this/path/does/not/exist/index.ts",
                "export const knownTypes = {}\\n",
                "utf8"
              ]
            ],
            }
        `)
  })

  it(`deletes and recreates directory when it does exist`, () => {
    main([join(__dirname, 'generated')])
    expect(fs.mocks).toMatchInlineSnapshot(`
      Object {
        "mkdirSync": [
        [
          "[cwd]/packages/typegen/test/generated",
          {
            "recursive": true
          }
        ]
      ],
        "rmdirSync": [
        [
          "[cwd]/packages/typegen/test/generated"
        ]
      ],
        "unlinkSync": [
        [
          "[cwd]/packages/typegen/test/generated/main"
        ],
        [
          "[cwd]/packages/typegen/test/generated/with-custom-date"
        ],
        [
          "[cwd]/packages/typegen/test/generated/with-date"
        ]
      ],
        "writeFileSync": [
        [
          "[cwd]/packages/typegen/test/generated/index.ts",
          "export const knownTypes = {}\\n",
          "utf8"
        ]
      ],
      }
    `)
  })

  it(`throws when not passed a directory path`, () => {
    expect(() => main([require.resolve('../src')])).toThrowError(/not a directory/)
  })
})
