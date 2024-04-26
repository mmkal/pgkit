import React from 'react'
import {s} from 'vitest/dist/reporters-1evA5lom.js'
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
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'

export const alertContext = createCascadingState<AlertOptions<unknown> | null>(null)

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

type AlertOptions<T> = {
  type: AlertType
  title: string
  onComplete?: (value: T) => void
  description?: React.ReactNode
  cancel?: string | null
  continue?: string
}

const defaultMessages = {
  cancel: 'Cancel',
  continue: 'Continue',
}

export const useAlert = () => {
  const [_, setOptions] = alertContext.useState()

  return {
    confirm: (title: string, options?: Omit<AlertOptions<boolean>, 'title' | 'type' | 'onComplete'>) => {
      return new Promise<boolean>(resolve => {
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
    },
    alert: (title: string, options?: Omit<AlertOptions<void>, 'title' | 'type' | 'onComplete'>) => {
      return new Promise<void>(resolve => {
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
    },
    prompt: (title: string, options?: Omit<AlertOptions<string | null>, 'title' | 'type' | 'onComplete'>) => {
      return new Promise<string | null>(resolve => {
        setOptions({
          type: 'prompt',
          title,
          ...defaultMessages,
          ...options,
          cancel: null,
          onComplete: (v: unknown) => {
            setOptions(null)
            resolve(v as never)
          },
        })
      })
    },
  } satisfies {
    [K in AlertType]: (title: string, options?: Omit<AlertOptionsMap[K], 'onComplete'>) => Promise<unknown>
  }
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
            <AlertDialogFooter>
              <Input onChange={ev => setValue(ev.target.value)} />
              {options.cancel && (
                <AlertDialogCancel onClick={() => options.onComplete?.(null)}>{options.cancel}</AlertDialogCancel>
              )}
              <AlertDialogAction onClick={() => options.onComplete?.(value)}>{options.continue}</AlertDialogAction>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
