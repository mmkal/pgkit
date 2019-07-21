const fs = require('fs')
const os = require('os')

const packageDirs = fs.readdirSync('packages')
const packageInfoList = packageDirs
  .map(dirName => {
    const packageJson = JSON.parse(fs.readFileSync(`packages/${dirName}/package.json`, 'utf8'))
    const logLine = fs
      .readFileSync(`packages/${dirName}/readme.md`, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .find(line => line.match(/^[a-zA-Z]/)) // first line that starts with a letter
    return {packageJson, logLine}
  })
  .map(info => `[${info.packageJson.name}](${info.packageJson.homepage}) - ${info.logLine}`.trim())
  .sort()
  .map((line, index) => `${index + 1}. ${line}`)
  .join(os.EOL)

const existingReadme = fs.readFileSync('readme.md', 'utf8')

const lines = existingReadme.split(os.EOL + os.EOL)
const packagesSectionIndex = lines.findIndex((line, index) => !!line && index > lines.indexOf('## Packages'))
packagesSectionIndex > -1 ? lines[packagesSectionIndex] = packageInfoList : lines.push(packageInfoList)

fs.writeFileSync('readme.md', lines.join(os.EOL + os.EOL).trim() + os.EOL, 'utf8')
