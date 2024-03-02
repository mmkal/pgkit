import {createClient} from '@pgkit/client'
import {writeFileSync} from 'fs'
import {getFixtures} from '../test/fixtures'

const admin = createClient('postgresql://postgres:postgres@localhost:5432/postgres')

writeFileSync(
  'scripts/commands.txt',
  getFixtures('generate_commands')
    .flatMap(f => [
      `to debug ${f.name}:`,
      `pnpm migra '${f.variants(admin).join(`' '`)}' ${f.cliArgs().join(' ')}`,
      `migra '${f.variants(admin).join(`' '`)}' ${f.cliArgs().join(' ')}`,
      '',
    ])
    .join('\n'),
)
