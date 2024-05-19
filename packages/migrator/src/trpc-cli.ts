/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {Procedure, Router, TRPCError, inferRouterContext, initTRPC} from '@trpc/server'
import * as cleye from 'cleye'
import {ZodError, z} from 'zod'
import ztjs from 'zod-to-json-schema'
import {fromError} from 'zod-validation-error'

export type TrpcCliParams<R extends Router<any>> = {
  router: R
  context?: inferRouterContext<R>
  argv?: string[]
  getAlias?: (fullName: string, meta: {command: string; flags: Record<string, unknown>}) => string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trpcCli = async <R extends Router<any>>({
  router: appRouter,
  argv,
  context,
  getAlias,
}: TrpcCliParams<R>) => {
  const parsedArgv = cleye.cli(
    {
      name: 'trpc-cli',
      version: '0.0.0',
      flags: {
        fullErrors: {
          type: Boolean,
          description: `Throw unedited raw errors rather than summarising to make more human-readable.`,
          default: false,
        },
      },
      commands: Object.entries(appRouter._def.procedures).map(([commandName, _value]) => {
        const value = _value as Procedure<any, any>
        value._def.inputs.forEach(input => {
          if (!(input instanceof z.ZodType)) {
            throw new TypeError(`Only zod schemas are supported, got ${input}`)
          }
        })
        const zodSchema: z.ZodType<any> =
          value._def.inputs.length === 1
            ? (value._def.inputs[0] as never)
            : (z.intersection(...(value._def.inputs as [never, never])) as never)

        const jsonSchema = ztjs(zodSchema) // todo: inspect zod schema directly, don't convert to json-schema first

        const objectProperties = (sch: typeof jsonSchema) => ('properties' in sch ? sch.properties : {})

        const flattenedProperties = (sch: typeof jsonSchema): ReturnType<typeof objectProperties> => {
          if ('properties' in sch) {
            return sch.properties
          }
          if ('allOf' in sch) {
            return Object.fromEntries(
              sch.allOf.flatMap(subSchema => Object.entries(flattenedProperties(subSchema as typeof jsonSchema))),
            )
          }
          if ('anyOf' in sch) {
            return Object.fromEntries(
              sch.anyOf.flatMap(subSchema => Object.entries(flattenedProperties(subSchema as typeof jsonSchema))),
            )
          }
          return {}
        }

        const properties = flattenedProperties(jsonSchema)

        if (Object.entries(properties).length === 0) {
          throw new TypeError(`Schemas looking like ${Object.keys(jsonSchema).join(', ')} are not supported`)
        }

        const flags = Object.fromEntries(
          Object.entries(properties).map(([propertyKey, propertyValue]) => {
            const type = 'type' in propertyValue ? propertyValue.type : null
            let cliType
            switch (type) {
              case 'string': {
                cliType = String
                break
              }
              case 'number': {
                cliType = Number
                break
              }
              case 'boolean': {
                cliType = Boolean
                break
              }
              case 'array': {
                cliType = [String]
                break
              }
              case 'object': {
                cliType = (s: string) => JSON.parse(s) as {}
                break
              }
              default: {
                cliType = x => x
                break
              }
            }

            const getDescription = (v: typeof propertyValue): string => {
              if ('items' in v) {
                return [getDescription(v.items as typeof propertyValue), '(list)'].filter(Boolean).join(' ')
              }
              return (
                Object.entries(v)
                  .filter(([k, vv]) => {
                    if (k === 'default' || k === 'additionalProperties') return false
                    if (k === 'type' && typeof vv === 'string') return false
                    return true
                  })
                  .sort(([a], [b]) => {
                    const scores = [a, b].map(k => (k === 'description' ? 0 : 1))
                    return scores[0] - scores[1]
                  })
                  .map(([k, vv], i) => {
                    if (k === 'description' && i === 0) return String(vv)
                    if (k === 'properties') return `Object (json formatted)`
                    return `${k}: ${vv}`
                  })
                  .join('; ') || ''
              )
            }

            let description = getDescription(propertyValue)
            if ('required' in jsonSchema && !jsonSchema.required?.includes(propertyKey)) {
              description = `${description} (optional)`.trim()
            }
            description ||= undefined

            return [
              propertyKey,
              {
                type: cliType,
                description,
                default: propertyValue.default,
              },
            ]
          }),
        )

        Object.entries(flags).forEach(([fullName, flag]) => {
          const alias = getAlias?.(fullName, {command: commandName, flags})
          if (alias) {
            Object.assign(flag, {alias})
          }
        })

        return cleye.command({
          name: commandName,
          ...(value.meta?.description && {
            help: {description: value.meta?.description},
          }),
          flags: flags,
        })
      }) as cleye.Command[],
    },
    undefined,
    argv,
  )

  const caller = initTRPC.context<typeof context>().create({}).createCallerFactory(appRouter)(context)

  const die = (message: string, cause?: unknown) => {
    if (parsedArgv.flags.fullErrors) {
      throw (cause as Error) || new Error(message)
    }
    // eslint-disable-next-line no-console
    console.error(message)
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }

  if (Object.entries(parsedArgv.unknownFlags).length > 0) {
    const s = Object.entries(parsedArgv.unknownFlags).length === 1 ? '' : 's'
    return die(`Unexpected flag${s}: ${Object.keys(parsedArgv.unknownFlags).join(', ')}`)
  }

  // @ts-expect-error cleye types are dynamic
  const command = parsedArgv.command as keyof typeof caller

  if (!command) {
    parsedArgv.showHelp()
    return
  }

  try {
    // @ts-expect-error cleye types are dynamic
    return (await caller[parsedArgv.command](parsedArgv.flags)) as never
  } catch (err) {
    if (err instanceof TRPCError) {
      const cause = err.cause
      if (cause instanceof ZodError) {
        const originalIssues = cause.issues
        try {
          cause.issues = cause.issues.map(iss => ({
            ...iss,
            path: ['--' + iss.path[0], ...iss.path.slice(1)],
          }))

          const prettyError = fromError(cause, {prefixSeparator: '\n  - ', issueSeparator: '\n  - '})

          return die(prettyError.message, cause)
        } finally {
          cause.issues = originalIssues
        }
      }
    }
    throw err
  }
}

if (require.main === module) {
  const trpc = initTRPC.context<{foo: 1}>().create({})

  const fooRouter = trpc.router({
    readonly: trpc.router({
      list: trpc.procedure
        .meta({description: 'heyyyyy'})
        .input(
          z.object({
            filter: z.string().optional(),
          }),
        )
        .query(({input}) => {
          console.log({input}, '<<<list')
          return [{foo: 1}]
        }),
    }),
    down: trpc.procedure
      .input(
        z.union([
          z.object({to: z.string()}).strict(), //
          z.object({step: z.number()}).strict(),
        ]),
      )
      .mutation(input => {
        console.log({downinput: input}, '<<<down')
      }),
    up: trpc.procedure
      .input(
        z.object({
          ss: z.string().optional(),
        }),
      )
      .input(
        z.object({
          // bb: z.boolean(),
          // ee: z.enum(['a', 'b']),
          nn: z.number().describe('numbeer of things').min(2).max(10).describe('two thru ten').optional(),
          aa: z.array(z.string()).optional(),
          uu: z.union([z.number(), z.string()]).optional(),
          oo: z.object({x: z.string()}),
        }),
      )
      .mutation(({input}) => {
        console.log({upinput: input}, '<<<up')
      }),
  })

  void trpcCli({
    router: fooRouter,
  })
}
