import * as jsYaml from 'js-yaml'
import {expect, vi as jest} from 'vitest'

expect.addSnapshotSerializer({
  test: val => jest.isMockFunction(val),
  print: val =>
    jsYaml
      .dump((val as ReturnType<typeof jest.fn>).mock.calls)
      .replaceAll(process.cwd(), '[cwd]')
      .replaceAll(process.cwd().replaceAll('\\', '/'), '[cwd]'),
})
