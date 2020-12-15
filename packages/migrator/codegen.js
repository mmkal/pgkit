const path = require('path')
const fs = require('fs')
const os = require('os')
const SlonikMigrator = require('.').SlonikMigrator
const stripAnsi = require('strip-ansi')

/** @type {import('eslint-plugin-codegen').Preset<{}>} */
module.exports = () => {
  /** @type {any} */
  const options = {migrationsPath: __dirname + '/road/to/nowhere'}
  const migrator = new SlonikMigrator(options)
  const cli = migrator.getCli()
  const helpTexts = [
    ['Commands', cli.renderHelpText()],
    ...cli.actions.map(a => ['#' + a.actionName, a.renderHelpText()]),
  ]

  return helpTexts
    .map(([title, text]) => {
      text = stripAnsi(text.trim().replace(/\r?\n-h$/, '-h'))
      text = '```' + os.EOL + text + os.EOL + '```'
      title = `##${title}`.replace(/(\w)/, ' $1')
      return `${title}${os.EOL}${os.EOL}${text}`.trim()
    })
    .join(os.EOL + os.EOL)
  return
  const umzugEntrypoint = require.resolve('umzug')
  const umzugReadmePath = path.resolve(path.dirname(umzugEntrypoint), '../README.md')
  const umzugReadme = fs.readFileSync(umzugReadmePath).toString()
  const sections = umzugReadme.split(/\n(?=###? )/)
  const cliSection = sections.find(s => s.startsWith('### CLI'))
  return ''
  return (
    cliSection
      .split('\n')
      .filter(line => !line.startsWith('<!-- codegen:'))
      .filter(line => !line.includes('🚧🚧🚧'))
      // .map(line => line.replace())
      .join('\n')
      .trim()
  )
}
