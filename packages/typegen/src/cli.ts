import {createCli} from 'trpc-cli'
import {router} from './router'

const cli = createCli({router})

void cli.run()
