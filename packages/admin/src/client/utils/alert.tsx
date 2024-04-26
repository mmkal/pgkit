import React from 'react'
import {createCascadingState} from './cascading-state'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {Input} from '@/components/ui/input'

export const alertContext = createCascadingState<AlertConfig<unknown> | null>(null)

export type AlertOptionsMap = {
  alert: {
    description?: React.ReactNode
    continue?: string
  }
  confirm: {
    description?: React.ReactNode
    cancel?: string
    continue?: string
  }
  prompt: {
    description?: React.ReactNode
    cancel?: string
    continue?: string
  }
}

type AlertType = 'alert' | 'confirm' | 'prompt'

export interface AlertOptions {
  description?: React.ReactNode
  cancel?: string | null
  continue?: string
}

export interface AlertConfig<T> extends AlertOptions {
  type: AlertType
  title: string
  onComplete?: (value: T) => void
}

export interface Alerter<T> {
  (title: string): Promise<T>
  (title: string, onComplete: (value: T) => void): void

  (title: string, options: AlertOptions): Promise<T>
  (title: string, options: AlertOptions, onComplete: (value: T) => void): void
}

const defaultMessages: AlertOptions = {
  cancel: 'Cancel',
  continue: 'Continue',
  description: null,
}

function createAlerter<T>(
  promiseAlerter: (title: string, options?: Omit<AlertConfig<T>, 'title' | 'type' | 'onComplete'>) => Promise<T>,
) {
  return function alerter(...args) {
    if (typeof args.at(-1) === 'function') {
      return promiseAlerter(...(args.slice(0, -1) as [never])).then(args.at(-1) as never)
    }
    return promiseAlerter(...(args.slice() as [never]))
  } as Alerter<T>
}

export const useAlerter = () => {
  const [_, setOptions] = alertContext.useState()

  return {
    confirm: createAlerter<boolean>((title, options) => {
      return new Promise(resolve => {
        setOptions({
          type: 'confirm',
          title,
          ...defaultMessages,
          ...options,
          onComplete: v => {
            setOptions(null)
            resolve(v as never)
          },
        })
      })
    }),
    alert: createAlerter<void>((title, options) => {
      return new Promise(resolve => {
        setOptions({
          type: 'alert',
          title,
          ...defaultMessages,
          ...options,
          onComplete: () => {
            setOptions(null)
            resolve()
          },
        })
      })
    }),
    prompt: createAlerter<string | null>((title, options) => {
      return new Promise(resolve => {
        setOptions({
          type: 'prompt',
          title,
          ...defaultMessages,
          ...options,
          onComplete: (v: unknown) => {
            setOptions(null)
            resolve(v as never)
          },
        })
      })
    }),
  }
}

export function AlertProvider(props: {children?: React.ReactNode}) {
  return (
    <alertContext.Provider>
      {props.children}
      <AutoAlertDialog />
    </alertContext.Provider>
  )
}

export function AutoAlertDialog(props: {children?: React.ReactNode}) {
  const [options] = alertContext.useState()
  const [value, setValue] = React.useState<unknown>(null)

  return (
    <AlertDialog open={Boolean(options)} onOpenChange={v => (v ? void 0 : options?.onComplete?.(null))}>
      <AlertDialogTrigger className="hidden">{props.children}</AlertDialogTrigger>
      {options && (
        <AlertDialogContent className="bg-black">
          <AlertDialogHeader>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {options.type === 'alert' && (
            <AlertDialogFooter>
              <AlertDialogAction onClick={options.onComplete}>{options.continue}</AlertDialogAction>
            </AlertDialogFooter>
          )}
          {options.type === 'confirm' && (
            <AlertDialogFooter>
              {options.cancel && (
                <AlertDialogCancel onClick={() => options.onComplete?.(false)}>{options.cancel}</AlertDialogCancel>
              )}
              <AlertDialogAction onClick={() => options.onComplete?.(true)}>{options.continue}</AlertDialogAction>
            </AlertDialogFooter>
          )}
          {options.type === 'prompt' && (
            <>
              <Input onChange={ev => setValue(ev.target.value)} />
              <AlertDialogFooter>
                {options.cancel && (
                  <AlertDialogCancel onClick={() => options.onComplete?.(null)}>{options.cancel}</AlertDialogCancel>
                )}
                <AlertDialogAction onClick={() => options.onComplete?.(value)}>{options.continue}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
