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
