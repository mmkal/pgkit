import {initTRPC} from '@trpc/server'

export interface ServerContext {
  connectionString: string
}

export const trpc = initTRPC.context<ServerContext>().create()

export const {procedure: publicProcedure} = trpc
