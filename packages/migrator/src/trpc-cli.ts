/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {Procedure, Router, TRPCError, inferRouterContext, initTRPC} from '@trpc/server'
import * as cleye from 'cleye'
import colors from 'picocolors'
import {ZodError, z} from 'zod'
import ztjs from 'zod-to-json-schema'
import * as zodValidationError from 'zod-validation-error'

export type TrpcCliParams<R extends Router<any>> = {
  router: R
  context?: inferRouterContext<R>
  argv?: string[]
  alias?: (fullName: string, meta: {command: string; flags: Record<string, unknown>}) => string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trpcCli = async <R extends Router<any>>({router: appRouter, argv, context, alias}: TrpcCliParams<R>) => {
  const parsedArgv = cleye.cli(
    {
      flags: {
        fullErrors: {
          type: Boolean,
          description: `Throw unedited raw errors rather than summarising to make more human-readable.`,
          default: false,
        },
      },
      commands: Object.entries(appRouter._def.procedures).map(([commandName, _value]) => {
        const value = _value as Procedure<any, any>
        value._def.inputs.forEach((input: unknown) => {
          if (!(input instanceof z.ZodType)) {
            throw new TypeError(`Only zod schemas are supported, got ${input?.constructor.name}`)
          }
        })
        const zodSchema: z.ZodType<any> =
          value._def.inputs.length === 1
            ? (value._def.inputs[0] as never)
            : (z.intersection(...(value._def.inputs as [never, never])) as never)

        const jsonSchema = value._def.inputs.length > 0 ? ztjs(zodSchema) : {} // todo: inspect zod schema directly, don't convert to json-schema first

        const objectProperties = (sch: typeof jsonSchema) => ('properties' in sch ? sch.properties : {})

        const flattenedProperties = (sch: typeof jsonSchema): ReturnType<typeof objectProperties> => {
          if ('properties' in sch) {
            return sch.properties
          }
          if ('allOf' in sch) {
            return Object.fromEntries(
              sch.allOf!.flatMap(subSchema => Object.entries(flattenedProperties(subSchema as typeof jsonSchema))),
            )
          }
          if ('anyOf' in sch) {
            return Object.fromEntries(
              sch.anyOf!.flatMap(subSchema => Object.entries(flattenedProperties(subSchema as typeof jsonSchema))),
            )
          }
          return {}
        }

        const properties = flattenedProperties(jsonSchema)

        if (Object.entries(properties).length === 0) {
          //   throw new TypeError(`Schemas looking like ${Object.keys(jsonSchema).join(', ')} are not supported`)
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
                cliType = (x: unknown) => x
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
                    return scores[0]! - scores[1]!
                  })
                  .map(([k, vv], i) => {
                    if (k === 'description' && i === 0) return String(vv)
                    if (k === 'properties') return `Object (json formatted)`
                    return `${k}: ${vv}`
                  })
                  .join('; ') || ''
              )
            }

            let description: string | undefined = getDescription(propertyValue)
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
          const a = alias?.(fullName, {command: commandName, flags})
          if (a) {
            Object.assign(flag, {alias: a})
          }
        })

        return cleye.command({
          name: commandName,
          help: value.meta,
          flags: flags as {},
        })
      }) as cleye.Command[],
    },
    undefined,
    argv,
  )

  let {fullErrors, ...unknownFlags} = parsedArgv.unknownFlags
  fullErrors ||= parsedArgv.flags.fullErrors

  const caller = initTRPC.context<NonNullable<typeof context>>().create({}).createCallerFactory(appRouter)(context)

  const die = (message: string, {cause, help = true}: {cause?: unknown; help?: boolean} = {}) => {
    if (fullErrors) {
      throw (cause as Error) || new Error(message)
    }
    // eslint-disable-next-line no-console
    console.error(colors.red(message))
    if (help) {
      parsedArgv.showHelp()
    }
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }

  const command = parsedArgv.command as keyof typeof caller

  if (!command && parsedArgv._.length === 0) {
    return die('No command provided.')
  }

  if (!command) {
    die(`Command "${parsedArgv._.join(' ')}" not recognised.`)
  }

  if (Object.entries(unknownFlags).length > 0) {
    const s = Object.entries(unknownFlags).length === 1 ? '' : 's'
    return die(`Unexpected flag${s}: ${Object.keys(parsedArgv.unknownFlags).join(', ')}`)
  }

  try {
    const {help, ...flags} = parsedArgv.flags
    // @ts-expect-error cleye types are dynamic
    return (await caller[parsedArgv.command](flags)) as never
  } catch (err) {
    if (err instanceof TRPCError) {
      const cause = err.cause
      if (cause instanceof ZodError) {
        const originalIssues = cause.issues
        try {
          cause.issues = cause.issues.map(issue => ({
            ...issue,
            path: ['--' + issue.path[0], ...issue.path.slice(1)],
          }))

          const prettyError = zodValidationError.fromError(cause, {prefixSeparator: '\n  - ', issueSeparator: '\n  - '})

          return die(prettyError.message, {cause, help: true})
        } finally {
          cause.issues = originalIssues
        }
      }
      if (err.code === 'INTERNAL_SERVER_ERROR') {
        throw cause
      }
      if (err.code === 'BAD_REQUEST') {
        return die(err.message, {cause: err})
      }
    }
    throw err
  }
}
