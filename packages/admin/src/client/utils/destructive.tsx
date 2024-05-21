import {useMutation} from '@tanstack/react-query'
import {AlertOptions, useAlerter} from './alerter'

export function useDestructive<T extends {mutateAsync: Function}>(
  input: T,
  ...alerterArgs: [title?: string, options?: AlertOptions]
) {
  const alerter = useAlerter()
  const wrapped = useMutation(async (...args: never[]) => {
    const [title = 'Are you sure?', options = {}] = alerterArgs
    const confirmed = await alerter.confirm(title, options)
    if (!confirmed) return
    return input.mutateAsync(...args) as unknown
  }) as T

  return Object.assign(wrapped, {
    disable: (disable: boolean | undefined) => (disable ? input : wrapped),
  })
}

export type RQMutationLike<P extends unknown[]> = {
  mutate: (...args: P) => unknown
  mutateAsync: (...args: P) => Promise<unknown>
  isLoading: boolean
}

export function useConfirmable<T extends RQMutationLike<any[]>>(input: T, options?: {auto?: boolean}): T {
  const alerter = useAlerter()
  const wrapped = useMutation(async (params?: {confirmation?: string}) => {
    return input.mutateAsync(params as never).catch(async e => {
      if (String(e).includes('confirmation_missing')) {
        const confirmation = String(e).split('confirmation_missing:')[1]
        if (confirmation) {
          const yes =
            options?.auto ||
            (await alerter.confirm('This action may be destructive. Please confirm you want to run the following:', {
              description: (
                <div className="max-h-[300px] overflow-auto">
                  <pre>{confirmation}</pre>
                </div>
              ),
            }))
          if (yes) return input.mutateAsync({...params, confirmation})
        }
      }
      throw e
    })
  }) as T

  return Object.assign(wrapped, {
    disable: (disable: boolean | undefined) => (disable ? input : wrapped),
  })
}
