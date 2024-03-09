import {initTRPC} from '@trpc/server'
import {ServerContext} from './context.js'

export const trpc = initTRPC.context<ServerContext>().create()

export const {procedure: publicProcedure} = trpc
