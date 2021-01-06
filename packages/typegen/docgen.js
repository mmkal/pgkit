const fs = require('fs')
const path = require('path')
const os = require('os')
const {dedent} = require('./dist/gdesc/util')

exports.basicExample = () => {
  const testFile = path.join(__dirname, 'test/example.test.ts')
  const outputFile = path.join(__dirname, 'test/fixtures/example.test.ts/example-typegen/index.ts')

  const test = fs.readFileSync(testFile).toString()

  const testTemplates = test
    .split('\\`')
    .join('BACKTICK')
    .split('`')
    .map((section, i, arr) => {
      // take the even ones as a dumb way to get template strings
      return i % 2 === 1 ? section.split('BACKTICK').join('`') : null
    })
    .filter(section => typeof section === 'string')
    .map(dedent)

  const setup = testTemplates[0].trim()
  const input = testTemplates[1].replace(/ \/\/.*/gm, '').trim()
  const output = dedent(testTemplates[2].split(`|-`)[1].split(`"`)[0]).trim()

  // const output = fs.readFileSync(outputFile).toString()

  // // hack: get the input back from the output by getting rid of <...> and the generated interfaces
  // const input = output.replace(/<.*?>/g, '').split('module queries')[0].trim()

  return [
    `For a table defined with:`,
    '',
    '```sql',
    setup,
    '```',
    '',
    `Source code before:`,
    '',
    '```ts',
    input,
    '```',
    '',
    'Source code after:',
    '',
    '```ts',
    output,
    '```',
  ].join(os.EOL)
}

exports.cliHelpText = () => {
  const {SlonikTypegenCLI} = require('./dist/gdesc/cli')
  return (
    '```' +
    os.EOL +
    new SlonikTypegenCLI()
      .getAction('generate')
      .renderHelpText()
      .replace(/\n  -/g, '\n\n  -') // add spacing
      .trim() +
    os.EOL +
    '```'
  )
}
