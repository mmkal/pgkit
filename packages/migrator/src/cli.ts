import * as prompt from '@inquirer/prompts'
import * as childProcess from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as colors from 'picocolors'
import {createCli} from 'trpc-cli'
import {Migrator} from './migrator'
import {createMigratorRouter} from './router'

export const getMigratorFromEnv = () => {
  return new Migrator({
    client: process.env.PGKIT_CONNECTION_STRING || 'postgresql://postgres:postgres@localhost:5432/postgres',
    migrationsPath: process.env.PGKIT_MIGRATIONS_PATH || path.join(process.cwd(), 'migrations'),
    migrationTableName: process.env.PGKIT_MIGRATIONS_TABLE_NAME || 'pgkit_migrations',
  })
}

export const createMigratorCli = (migrator: Migrator) => {
  return createCli({
    router: createMigratorRouter(),
    context: {migrator, confirm},
  })
}

export type MigratorCLI = ReturnType<typeof createMigratorCli>

export const confirm = async (input: string, options?: {readonly?: boolean}): Promise<string | null> => {
  let currentInput = input

  while (currentInput.trim()) {
    const message = `${colors.underline('Please confirm you want to run the following')}:\n\n${currentInput}`
    const editors = [
      ...new Set([process.env.VISUAL, process.env.EDITOR, 'cursor', 'code', 'vi', 'emacs', 'nano', 'notepad']),
    ].filter(name => {
      return !name?.match(/\W/) && childProcess.execSync(`sh -c 'which ${name} || echo ""'`).toString().trim()
    })
    const choice = await prompt.select({
      message,
      choices: [
        {name: 'Yes', value: 'yes'},
        {name: 'No', value: 'no'},
        ...editors.map(name => ({
          name: `Edit with ${name}`,
          disabled: options?.readonly,
          description: `Save and close the file after editing. You'll be asked again if you want to run the edit migration afterwards.`,
          value: `edit-${name}`,
        })),
      ],
    })

    if (choice === 'yes') return currentInput
    if (choice === 'no') return null

    currentInput = await editTempFile(currentInput, choice.replace('edit-', ''))
  }

  return null
}

async function editTempFile(input: string, editor = process.env.EDITOR || 'vi'): Promise<string> {
  const tempFile = path.join(os.tmpdir(), `pgkit-migrator`, `changes-${Date.now()}.sql`)
  fs.mkdirSync(path.dirname(tempFile), {recursive: true})
  fs.writeFileSync(tempFile, input.trim() + '\n')

  try {
    await new Promise<void>((resolve, reject) => {
      const child = childProcess.spawn(editor, [tempFile], {stdio: 'inherit'})
      child.on('exit', code => {
        if (code === 0) resolve()
        else reject(new Error(`Editor exited with code ${code}`))
      })
    })

    // Wait for user input to ensure the file has been saved
    await prompt.input({message: 'Press Enter when you have finished editing'})

    const editedContent = fs.readFileSync(tempFile, 'utf8')
    return editedContent.trim()
  } finally {
    fs.unlinkSync(tempFile)
  }
}
