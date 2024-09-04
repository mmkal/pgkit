import * as jsYaml from 'js-yaml'
import {expect, vi as jest} from 'vitest'

expect.addSnapshotSerializer({
  test: val => jest.isMockFunction(val),
  print: val =>
    jsYaml
      .dump((val as ReturnType<typeof jest.fn>).mock.calls, {
        replacer: (key, value) => {
          if (value instanceof Error) {
            return {message: value.message, cause: value.cause}
          }
          return value
        },
      })
      .replaceAll(process.cwd(), '[cwd]')
      .replaceAll(process.cwd().replaceAll('\\', '/'), '[cwd]'),
})
