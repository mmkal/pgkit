const fs = require('fs')
const path = require('path')

exports.docgen = () => {
  const types = fs.readFileSync(path.join(__dirname, 'src/gdesc/types.ts')).toString()
  const start = types.indexOf('interface GdescriberParams')
  const end = types.indexOf('export ', start)
  return '```ts\n' + types.slice(start, end).trim() + '\n```'
}
