import * as jsYaml from 'js-yaml'

expect.addSnapshotSerializer({
  test: val => jest.isMockFunction(val),
  print: val =>
    jsYaml
      .dump((val as jest.Mock).mock.calls)
      .split(process.cwd())
      .join('[cwd]')
      .split(process.cwd().replace(/\\/g, '/'))
      .join('[cwd]'),
})
