import {execaSync} from '@rebundled/execa'
import {CodegenPreset} from 'eslint-plugin-mmkal'
import stripAnsi from 'strip-ansi'

export const help: import('eslint-plugin-mmkal').CodegenPreset<{command?: string}> = ({options}) => {
  const {stdout} = execaSync('./node_modules/.bin/tsx', ['src/bin', options.command!, '--help'].filter(Boolean), {
    all: true as never,
  })
  const stripped = stripAnsi(stdout)
  return [
    `### \`${options.command || `@pgkit/migrator`}\``,
    '',
    '```yaml',
    JSON.stringify(parseCLIHelp(stripped), null, 2), //
    '```',
  ].join('\n')
}

export const cliToMarkdown: CodegenPreset<{cli: string}> = ({options: {cli}}) => {
  const {stdout: root} = execaSync('./node_modules/.bin/tsx', [cli, '--help'])

  const rootParsed = parseCLIHelp(root)
  delete rootParsed.sections.Flags // rm default flags
  rootParsed.sections.Commands!.rows.forEach(row => {
    row.link = `#command-${row.name}`
  })

  const commands = rootParsed.sections.Commands!.rows.map(cmd => {
    const {stdout} = execaSync('./node_modules/.bin/tsx', ['src/bin', cmd.name, '--help'])
    const parsed = parseCLIHelp(stdout)
    const first = Object.values(parsed.sections)[0]!
    first.title = `Command: ${first.title}`
    parsed.sections.Flags!.rows.sort((a, b) => {
      const scores = [a, b].map(r => (r.name.includes('--help') ? 1 : 0))
      return scores[0]! - scores[1]!
    })
    return parsed
  })

  //   if (Math.random()) return JSON.stringify({rootParsed}, null, 2) + '\n\n' + parsedHelpToMarkdown(rootParsed)

  return [
    parsedHelpToMarkdown(rootParsed), //
    ...commands.map(parsedHelpToMarkdown),
  ].join('\n\n---\n\n')
}

function parsedHelpToMarkdown(parsed: ReturnType<typeof parseCLIHelp>) {
  const sections = Object.values(parsed.sections)
  const blocks = sections.map((section, i) => {
    const headerLevel = i === 0 ? '###' : '####'
    return [
      `${headerLevel} ${section.title}`,
      section.description,
      section.rows
        .map(row => {
          let ref = `\`${row.name}\``
          if (row.link) ref = `[${ref}](${row.link})`
          return [`- ${ref}`, row.value].filter(Boolean).join(' - ')
        })
        .join('\n'),
    ]
      .filter(Boolean)
      .join('\n\n')
  })

  return blocks.join('\n\n')
}

function parseCLIHelp(text: string) {
  text = stripAnsi(text)
  // split by lines looking like `Section:\n`, using a lookahead to include the section name in the result
  const rawSections = text.split(/(?=\b\w+:$)/m)
  const sections = rawSections.map((section, i) => {
    const [head = '', ...content] = section.split(':\n').filter(Boolean)
    const [title, ...description] = head.split('\n')
    const body = content.join(':\n').trim()

    const rows = body
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .flatMap(line => {
        const [name, value] = line.split(/  +/)
        if (!name) return []
        return [{name, link: '', value}]
      })

    return {
      title: title || `Section ${i + 1}`,
      description: description.join('\n').trim(),
      body,
      rows,
    }
  })

  return {
    raw: text,
    sections: Object.fromEntries(sections.map(s => [s.title, s] as const)),
  }
}
