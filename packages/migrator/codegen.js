const path = require('path')
const fs = require('fs')
const os = require('os')
const stripAnsi = require('strip-ansi')

/** @type {import('eslint-plugin-codegen').Preset<{}>} */
module.exports = params => {
  let SlonikMigrator
  try {
    SlonikMigrator = require('./dist').SlonikMigrator
  } catch {
    require('ts-node/register/transpile-only')
    SlonikMigrator = require('./src').SlonikMigrator
  }
  const migrator = new SlonikMigrator({
    migrationTableName: 'not_a_real_table',
    migrationsPath: __dirname + '/not/a/real/path',
  })
  const cli = migrator.getCli()
  const helpTexts = [
    ['Commands', cli.renderHelpText()],
    ...cli.actions.map(a => ['#' + a.actionName, a.renderHelpText()]),
  ]

  return helpTexts
    .map(([title, text]) => {
      text = stripAnsi(text.trim())
      text = '```' + os.EOL + text + os.EOL + '```'
      title = `##${title}`.replace(/(\w)/, ' $1')
      return `${title}${os.EOL}${os.EOL}${text}`.trim()
    })
    .join(os.EOL + os.EOL)
    .replace(/<script>/g, 'node migrate')
}
