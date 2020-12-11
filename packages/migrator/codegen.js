const path = require('path')
const fs = require('fs')

/** @type {import('eslint-plugin-codegen').Preset<{}>} */
module.exports = () => {
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
