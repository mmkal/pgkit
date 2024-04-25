const fs = require('fs')
const readline = require('node:readline')

async function main() {
  const rl = readline.createInterface({
    // @ts-ignore
    input: process.stdin,
  })

  const lines = ['\n']
  for await (const line of rl) lines.push(line)

  const files = lines
    .join('\n')
    .split('\n=== ')
    .filter(part => part.trim())
    .map(content => ({
      filename: content.split(' ===')[0],
      content: `// ${content}`,
    }))

  if (files.length < 2) {
    throw new Error(`Doesn't seem to be a valid v0 input from stdin: ${lines.join('\n')}`)
  }

  const js = files[0].content

  const ts = js
    .slice(js.indexOf('import'))
    .replace(``, `import React from 'react'\n`)
    .replace(`import Link from "next/link"`, '')
    .replace(
      'export',
      `export type SVGProps = React.DetailedHTMLProps<React.HTMLAttributes<SVGSVGElement>, SVGSVGElement>\n\nexport`,
    )
    .replace('export', `export const Link = (props: React.AnchorHTMLAttributes<{}>) => <a {...props} />\n\nexport`)
    .replaceAll('(props) {', '(props: SVGProps) {')

  const filepath = process.argv[2] || 'src/client/page.tsx'
  if (!filepath.endsWith('.tsx')) {
    throw new Error(`Invalid filepath ${filepath}`)
  }
  fs.writeFileSync(filepath, ts)
  console.log(filepath)
  console.warn(`You should run:`)
  console.warn(`pnpm eslint ${filepath} --fix`)
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main()
