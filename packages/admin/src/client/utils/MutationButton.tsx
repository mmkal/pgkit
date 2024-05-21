import {ComponentProps} from 'react'
import {toast} from 'sonner'
import {RQMutationLike, useConfirmable} from './destructive'
import {trpc} from './trpc'
import {Button} from '@/components/ui/button'
import {icons} from '@/components/ui/icons'

export interface TRPCMutationProcedureHelper<Options, Mutation> {
  // useMutation(opts?: Options): RQMutationLike<Variables>
  useMutation: (opts: Options) => Mutation
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BaseOptions = {onSuccess?: (data: any) => unknown}

export type Awaitable<T> = T | Promise<T>

interface MutationButtonProps<Options, Mutation> extends ComponentProps<typeof Button> {
  mutation: TRPCMutationProcedureHelper<Options, Mutation>
  icon?: keyof typeof icons
  options?: Options
  args?: Mutation extends RQMutationLike<infer Variables>
    ? Variables | null | (() => Awaitable<Variables | null>)
    : never
}

export function MutationButton<Options, Mutation>({
  mutation: _mutation,
  options: _options,
  args: _args,
  icon: _icon,
  children,
  ...buttonProps
}: MutationButtonProps<Options, Mutation>): JSX.Element {
  '' as Exclude<keyof typeof buttonProps, keyof ComponentProps<typeof Button>> satisfies never // make sure we aren't spreading custom props into Button
  const options = _options as Record<string, Function>
  const util = trpc.useUtils()
  const mutation = useConfirmable(
    _mutation.useMutation({
      onSuccess: async (data: unknown) => {
        await options?.onSuccess?.(data)
        await Promise.all([
          util.migrations.invalidate(),
          util.inspect.invalidate(),
          util.migrations.definitions.invalidate(),
        ])
      },
    } as Options) as RQMutationLike<[]>,
  )
  const Icon = _icon ? icons[_icon as 'SquarePlus'] : null

  return (
    <Button
      {...buttonProps}
      onClick={async () => {
        let args: [] | undefined
        if (typeof _args === 'function') {
          try {
            args = (await _args()) as []
          } catch (e) {
            toast.error(String(e))
          }
        } else if (Array.isArray(_args)) {
          args = _args as []
        } else if (_args === undefined) {
          args = []
        } else if (_args === null) {
          args = undefined
        } else {
          throw new Error(
            `Invalid args. Expected null, undefined, array or function that returns array. Got ${(_args as Object)?.constructor?.name || typeof _args}`,
          )
        }
        if (Array.isArray(args)) {
          mutation.mutate(...args)
        }
      }}
      disabled={mutation.isLoading}
    >
      {Icon && <Icon />}
      {children}
    </Button>
  )
}
