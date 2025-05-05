import * as prompts from 'enquirer'
import * as trpcCli from 'trpc-cli'
import {router} from './router'

export const cli = trpcCli.createCli({router})

void cli.run({prompts})
