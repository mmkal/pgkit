import {TRPCError, initTRPC} from '@trpc/server'
import * as cleye from 'cleye'
import {ZodError, z} from 'zod'
import ztjs from 'zod-to-json-schema'
import {fromError} from 'zod-validation-error'

const trpc = initTRPC.context<{foo: 1}>().create({})

const appRouter = trpc.router({
  up: trpc.procedure
    .input(
      z.object({
        ss: z.string(),
      }),
    )
    .input(
      z.object({
        // bb: z.boolean(),
        // ee: z.enum(['a', 'b']),
        nn: z.number(),
        // aa: z.array(z.string()),
        uu: z.union([z.number(), z.string()]).optional(),
        // oo: z.object({x: z.string()}),
      }),
    )
    .mutation(input => {
      console.log({upinput: input}, '<<<up')
    }),
})

export const trpcCli = async () => {
  const argv = cleye.cli({
    name: 'trpc-cli',
    commands: Object.entries(appRouter._def.procedures).map(([key, value]) => {
      value._def.inputs.forEach(input => {
        if (!(input instanceof z.ZodType)) {
          throw new TypeError('nope')
        }
      })
      const zodSchema: z.ZodType<any> =
        value._def.inputs.length === 1
          ? (value._def.inputs[0] as never)
          : (z.intersection(...(value._def.inputs as [never, never])) as never)

      const jsonSchema = ztjs(zodSchema)

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
        Object.entries(properties).map(([key, value]) => {
          const type = 'type' in value ? value.type : null
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
            }
            default: {
              cliType = x => x
            }
          }
          let description =
            Object.entries(value)
              .filter(([k, v]) => {
                if (k === 'default' || k === 'additionalProperties') return false
                if (k === 'type' && typeof v === 'string') return false
                return true
              })
              .map(([k, v]) => `${k}: ${v}`.replaceAll('[object Object]', '[object]'))
              .join(', ') || ''
          if (!jsonSchema.required?.includes(key)) {
            description = `${description} (optional)`.trim()
          }
          description ||= undefined
          return [
            key,
            {
              type: cliType,
              description,
              default: value.default,
              //   ...(zodSchema.default && {default: zodSchema.default}),
            },
          ]
        }),
      )

      return cleye.command({
        name: key,
        flags: flags,
      })
    }) as never,
  })

  const caller = trpc.createCallerFactory(appRouter)({foo: 1})

  const die = (message: string, cause?: unknown) => {
    // if (argv.flags.debug) {
    //   throw (cause as Error) || new Error(message)
    // }
    // eslint-disable-next-line no-console
    console.error(message, argv)
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }

  if (Object.entries(argv.unknownFlags).length > 0) {
    const s = Object.entries(argv.unknownFlags).length === 1 ? '' : 's'
    return die(`Unexpected flag${s}: ${Object.keys(argv.unknownFlags).join(', ')}`)
  }

  try {
    // @ts-expect-error cleye types are dynamic
    return (await caller[argv.command](argv.flags)) as never
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
  void trpcCli()
}
