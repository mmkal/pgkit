type GenerateOptions = {
  removeTests?: string[]
}

export const generate: import('eslint-plugin-codegen').Preset<GenerateOptions> = ({options, dependencies, context}) => {
  const original = dependencies.fs.readFileSync(dependencies.path.join(__dirname, 'client.test.ts'), 'utf8')
  let updated = original
    .slice(original.indexOf('beforeEach('))
    .replaceAll('test_pgsuite', 'test_' + context.physicalFilename.split('/').at(-1).split('.')[0])

  options.removeTests?.forEach(name => {
    const start = updated.indexOf(`test('${name}'`)
    const end = updated.indexOf(`test('`, start + 1)
    updated = updated.slice(0, start) + updated.slice(end)
  })

  let i = updated.length
  while (i > -1) {
    const snapshotCall = 'toMatchInlineSnapshot(`'
    i = updated.lastIndexOf(snapshotCall, i)
    const endOfSnapshot = updated.indexOf('`)', i + snapshotCall.length + 1)
    if (i > -1) updated = updated.slice(0, i) + 'toMatchSnapshot()' + updated.slice(endOfSnapshot + 2)
  }

  return updated
}
