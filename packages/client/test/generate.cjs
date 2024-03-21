/** @type {import('eslint-plugin-codegen').Preset<{removeTests?: string[]}>} */
exports.generate = ({options, dependencies, context}) => {
  const original = dependencies.fs.readFileSync(dependencies.path.join(__dirname, 'api-usage.test.ts'), 'utf8')
  let updated = original
    .slice(original.indexOf('beforeEach('))
    .replaceAll('usage_test', 'test_' + context.physicalFilename.split('/').at(-1).split('.')[0])
    .replaceAll('expect(result).toBeInstanceOf(Date)', 'expect(new Date(result)).toBeInstanceOf(Date)')

  /** @type {Array<string | number>} */
  const is = ['updated.length ' + updated.length]

  options.removeTests?.forEach(name => {
    const start = updated.indexOf(`test('${name}'`)
    if (start === -1) throw new Error(`Could not find test('${name}', ...)`)
    const end = updated.indexOf(`test('`, start + 1)
    updated = updated.slice(0, start) + '\n\n' + updated.slice(end)
    is.push(`new updated after ${name} ${updated.length} ${start} ${end}`)
  })

  is.push(`new updated ${updated.length}`)

  let i = updated.length
  while (i > -1) {
    is.push(i)
    if (is.length > 20) throw new Error('Infinite loop ' + is.join(','))
    const snapshotCall = 'toMatchInlineSnapshot(`'
    i = updated.lastIndexOf(snapshotCall, i - snapshotCall.length)
    const endOfSnapshot = updated.indexOf('`)', i + snapshotCall.length + 1)
    if (i > -1) updated = updated.slice(0, i) + 'toMatchSnapshot()' + updated.slice(endOfSnapshot + 2)
  }

  const newContent = updated
    .split('\n')
    .flatMap((line, j, arr) => (line || arr[j - 1] ? [line] : []))
    .join('\n')

  if (newContent.includes('toMatchInlineSnapshot')) {
    throw new Error(`toMatchInlineSnapshot still exists in the generated content`)
  }

  return newContent
}
